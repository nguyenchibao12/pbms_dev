import { Op } from 'sequelize';
import sequelize from '../config/db.js';
import { RefundRequest, Payment } from '../models/index.js';
import { AppError } from '../utils/helpers.js';
import { sendRefundBankInfoEmail } from '../utils/mailer.js';
import { getPassRefundPolicy } from '../utils/settings.js';
import { parsePagination, findAndPaginate, paginatedResult } from '../utils/pagination.js';

// P3-8 — trang HOÀN TIỀN của Admin: xem yêu cầu (kèm tên/SĐT/email/STK của user),
// nhắc user cập nhật STK qua email, chuyển khoản TAY rồi đánh dấu refunded.

const refundIncludes = [
  {
    association: 'user',
    attributes: [
      'user_id', 'full_name', 'username', 'phone', 'email',
      'bank_name', 'bank_account_number', 'bank_account_holder',
    ],
  },
  { association: 'pass', attributes: ['pass_id', 'plate_number', 'start_date', 'end_date', 'status'] },
  { association: 'reservation', attributes: ['reservation_id', 'plate_number', 'start_time', 'end_time', 'status'] },
  { association: 'payment', attributes: ['payment_id', 'order_code', 'amount', 'method', 'paid_at'] },
  { association: 'refundedBy', attributes: ['user_id', 'full_name', 'username'] },
];

/** "Đủ điều kiện chuyển khoản" suy ra lúc đọc — không lưu trạng thái trung gian. */
const withBankReady = (refund) => ({
  ...refund.toJSON(),
  bankInfoReady: Boolean(refund.user?.bank_account_number),
  // Nguồn hoàn cho FE lọc/hiển thị cột: vé tháng hay đặt chỗ (migration 006).
  type: refund.pass_id ? 'monthly_pass' : 'booking',
});

export const listRefunds = async ({ status, page, limit } = {}) => {
  const where = {};
  if (status) where.status = status;
  const pagination = parsePagination({ page, limit });
  const result = await findAndPaginate(RefundRequest, {
    where,
    include: refundIncludes,
    order: [['requested_at', 'DESC']],
    ...pagination,
  });
  return paginatedResult(result.items.map(withBankReady), result.total, result.page, result.limit);
};

export const getRefund = async (id) => {
  const refund = await RefundRequest.findByPk(id, { include: refundIncludes });
  if (!refund) throw new AppError('Refund request not found', 404, 'NOT_FOUND');
  return refund;
};

/** Gửi mail nhắc user cập nhật STK (nút trên trang admin khi ô STK còn trống). */
export const remindBankInfo = async (refundId) => {
  const refund = await getRefund(refundId);
  if (refund.status !== 'pending') {
    throw new AppError(`Yêu cầu không còn chờ xử lý (hiện tại: ${refund.status})`, 409, 'CONFLICT');
  }
  if (refund.user?.bank_account_number) {
    throw new AppError('User đã có tài khoản ngân hàng — có thể chuyển khoản ngay', 409, 'CONFLICT');
  }
  if (!refund.user?.email) {
    throw new AppError('User không có email — liên hệ qua số điện thoại', 409, 'CONFLICT');
  }

  const policy = getPassRefundPolicy();
  await sendRefundBankInfoEmail(refund.user.email, {
    fullName: refund.user.full_name,
    amount: refund.amount,
    profileUrl: `${process.env.CLIENT_URL}/profile`,
    deadlineDays: policy.bankInfoTtlDays,
  });
  return { sent: true, to: refund.user.email };
};

/** Admin đã chuyển khoản tay → chốt refunded (+ payment gốc 'refunded'). */
export const completeRefund = async (adminId, refundId, { note } = {}) => {
  const refund = await getRefund(refundId);
  if (refund.status !== 'pending') {
    throw new AppError(`Yêu cầu không còn chờ xử lý (hiện tại: ${refund.status})`, 409, 'CONFLICT');
  }
  if (!refund.user?.bank_account_number) {
    throw new AppError('User chưa cập nhật tài khoản ngân hàng — chưa thể hoàn tiền', 409, 'CONFLICT');
  }

  await sequelize.transaction(async (transaction) => {
    await refund.update(
      { status: 'refunded', refunded_at: new Date(), refunded_by: adminId, note: note || null },
      { transaction },
    );
    // Load payment ĐẦY ĐỦ (bản trong include bị giới hạn attributes — thiếu FK,
    // update sẽ vấp hook "reference exactly one" của model Payment).
    const payment = await Payment.findByPk(refund.payment_id, { transaction });
    if (payment) {
      await payment.update({ status: 'refunded' }, { transaction });
    }
  });
  return getRefund(refundId);
};

/**
 * Job (gọi từ passMaintenance): yêu cầu pending quá TTL mà user VẪN chưa có STK → expired.
 * Idempotent theo status; user đã có STK thì giữ pending chờ admin chuyển (không expire).
 */
export const expireStaleRefunds = async () => {
  const policy = getPassRefundPolicy();
  const cutoff = new Date(Date.now() - policy.bankInfoTtlDays * 24 * 3600 * 1000);
  const stale = await RefundRequest.findAll({
    where: { status: 'pending', requested_at: { [Op.lt]: cutoff } },
    include: [{ association: 'user', attributes: ['user_id', 'bank_account_number'] }],
  });

  let count = 0;
  for (const refund of stale) {
    if (refund.user?.bank_account_number) continue; // đã có STK — chờ admin, không expire
    await refund.update({ status: 'expired' });
    count += 1;
  }
  return count;
};
