import { Op } from 'sequelize';
import sequelize from '../config/db.js';
import { MonthlyPass, Payment, Floor, VehicleType } from '../models/index.js';
import { AppError } from '../utils/helpers.js';
import { generateQrToken } from '../utils/qr.js';
import { createPayOSPaymentLink, generateOrderCode } from './payos.client.js';
import { normalizeTimeInput } from '../utils/passWindow.js';
import { validateAndNormalizePlateVN } from '../utils/plateVN.js';
import { getPassCapacity } from '../utils/passCapacity.js';
import {
  getMonthlyPassPrice as getPassPriceFromSettings,
  getBuildingSettingsSync,
} from '../utils/settings.js';

const passIncludes = [
  { association: 'floor' },
  { association: 'vehicleType' },
  { association: 'user', attributes: ['user_id', 'full_name', 'username'] },
  { association: 'payments' },
];

export { getPassCapacity } from '../utils/passCapacity.js';

export const getMonthlyPassPrice = () => getPassPriceFromSettings();

const normalizePlate = (plate) => {
  const result = validateAndNormalizePlateVN(plate);
  if (!result.valid) throw new AppError(result.error, 400, 'VALIDATION_ERROR');
  return result.normalized;
};

const pad2 = (n) => String(n).padStart(2, '0');

/** Vé tháng cố định 1 tháng: end = start + 1 tháng − 1 ngày (trọn 1 tháng, inclusive) */
export const computePassEndDate = (startDateStr) => {
  const [y, m, d] = String(startDateStr).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setMonth(dt.getMonth() + 1);
  dt.setDate(dt.getDate() - 1);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
};

/** Khung giờ hằng ngày của vé tháng = giờ mở cửa tòa (snapshot lúc mua) */
const buildingDailyWindow = () => {
  const cfg = getBuildingSettingsSync();
  if (cfg.is_24_7) return { from: '00:00:00', to: '23:59:59' };
  return {
    from: normalizeTimeInput(cfg.open_time || '06:00'),
    to: normalizeTimeInput(cfg.close_time || '22:00'),
  };
};

export const getPass = async (id) => {
  const pass = await MonthlyPass.findByPk(id, { include: passIncludes });
  if (!pass) throw new AppError('Monthly pass not found', 404, 'NOT_FOUND');
  return pass;
};

export const listUserPasses = async (userId) =>
  MonthlyPass.findAll({
    where: { user_id: userId },
    include: passIncludes,
    order: [['created_at', 'DESC']],
  });

export const countPassCapacityUsage = async (floorId, vehicleTypeId) => {
  const today = new Date().toISOString().slice(0, 10);
  return MonthlyPass.count({
    where: {
      floor_id: floorId,
      vehicle_type_id: vehicleTypeId,
      status: { [Op.in]: ['pending', 'active'] },
      start_date: { [Op.lte]: today },
      end_date: { [Op.gte]: today },
    },
  });
};

export const findActivePassByPlate = async (plateNumber, floorId = null) => {
  const today = new Date().toISOString().slice(0, 10);
  const where = {
    plate_number: normalizePlate(plateNumber),
    status: 'active',
    start_date: { [Op.lte]: today },
    end_date: { [Op.gte]: today },
  };
  if (floorId) where.floor_id = floorId;
  return MonthlyPass.findOne({ where, include: passIncludes });
};

export const purchaseMonthlyPass = async (userId, data) => {
  const plateNumber = normalizePlate(data.plateNumber);
  const startDate = data.startDate;
  if (!startDate) {
    throw new AppError('startDate is required', 400, 'VALIDATION_ERROR');
  }

  // Chặn mua vé bắt đầu trong quá khứ (so theo NGÀY, không theo giờ — hôm nay vẫn hợp lệ):
  // vé lùi ngày mất tiền oan phần đã trôi qua.
  const today = new Date().toISOString().slice(0, 10);
  if (String(startDate).slice(0, 10) < today) {
    throw new AppError('Ngày bắt đầu không được ở quá khứ', 400, 'VALIDATION_ERROR');
  }

  // Cố định 1 tháng — hệ thống tự tính ngày kết thúc (không cho user nhập)
  const endDate = computePassEndDate(startDate);
  // Khung giờ hằng ngày = giờ mở cửa tòa (không cho user nhập giờ tự do)
  const { from: fromTime, to: toTime } = buildingDailyWindow();

  const floor = await Floor.findByPk(data.floorId);
  if (!floor) throw new AppError('Floor not found', 404, 'NOT_FOUND');

  const vehicleType = await VehicleType.findByPk(data.vehicleTypeId);
  if (!vehicleType) throw new AppError('Vehicle type not found', 404, 'NOT_FOUND');

  const capacity = await getPassCapacity(data.floorId, data.vehicleTypeId);
  if (capacity <= 0) {
    throw new AppError('No pass capacity configured for this floor and vehicle type', 409, 'CONFLICT');
  }

  const used = await countPassCapacityUsage(data.floorId, data.vehicleTypeId);
  if (used >= capacity) {
    throw new AppError('Monthly pass capacity full for this floor', 409, 'CONFLICT');
  }

  const existingActive = await findActivePassByPlate(plateNumber, data.floorId);
  if (existingActive) {
    throw new AppError('An active pass already exists for this plate on this floor', 409, 'CONFLICT');
  }

  const price = getMonthlyPassPrice();
  const pass = await MonthlyPass.create({
    user_id: userId,
    vehicle_type_id: data.vehicleTypeId,
    floor_id: data.floorId,
    plate_number: plateNumber,
    valid_from_time: fromTime,
    valid_to_time: toTime,
    start_date: startDate,
    end_date: endDate,
    status: 'pending',
  });

  // Pass `pending` đã COMMIT ở trên và countPassCapacityUsage đếm cả `pending`. Nếu tạo link
  // PayOS hoặc ghi Payment lỗi mà không bù trừ, vé kẹt `pending` chiếm suất capacity vĩnh viễn
  // (không payment, không webhook nào tới). Bọc saga: hỏng -> hủy vé (tái dùng
  // cancelPassOnPaymentFail). Job passMaintenance là lớp dự phòng nếu cả bù trừ cũng hỏng.
  let payosResult;
  let payment;
  try {
    const orderCode = generateOrderCode();
    payosResult = await createPayOSPaymentLink({
      orderCode,
      amount: price,
      description: `Pass ${plateNumber}`,
      returnUrl: `${process.env.CLIENT_URL}/monthly-pass`,
      cancelUrl: `${process.env.CLIENT_URL}/monthly-pass`,
    });

    payment = await Payment.create({
      pass_id: pass.pass_id,
      order_code: orderCode,
      amount: price,
      status: 'pending',
      method: 'payos',
      gateway_transaction_id: payosResult.paymentLinkId ? String(payosResult.paymentLinkId) : null,
      gateway_response: JSON.stringify(payosResult),
    });
  } catch (err) {
    await cancelPassOnPaymentFail(pass.pass_id).catch((cleanupErr) =>
      console.error(
        `[purchaseMonthlyPass] bù trừ thất bại cho pass #${pass.pass_id} (job passMaintenance sẽ dọn):`,
        cleanupErr.message,
      ),
    );
    console.error('[purchaseMonthlyPass] tạo thanh toán PayOS lỗi:', err.message);
    throw new AppError(
      'Không tạo được liên kết thanh toán, vé đã được hủy — vui lòng thử lại',
      502,
      'PAYMENT_GATEWAY_ERROR',
    );
  }

  return {
    pass: await getPass(pass.pass_id),
    payment,
    price,
    checkoutUrl: payosResult.checkoutUrl,
    capacity: { total: capacity, used: used + 1 },
  };
};

/**
 * Gọi NGƯỢC từ payment.service khi tiền về: pending -> active + sinh QR.
 * Phụ thuộc một chiều (payment dynamic-import hàm này).
 */
export const activatePassAfterPayment = async (payment) => {
  if (payment.status === 'success') {
    return { pass: await getPass(payment.pass_id), payment, activated: true, alreadyProcessed: true };
  }

  const pass = await MonthlyPass.findByPk(payment.pass_id);
  if (!pass) throw new AppError('Monthly pass not found', 404, 'NOT_FOUND');
  if (pass.status !== 'pending') {
    throw new AppError(`Pass is not pending (current: ${pass.status})`, 409, 'CONFLICT');
  }

  const qrToken = generateQrToken();
  await sequelize.transaction(async (transaction) => {
    await pass.update({ status: 'active', qr_token: qrToken }, { transaction });
    await payment.update({ status: 'success', paid_at: new Date() }, { transaction });
  });

  return { pass: await getPass(pass.pass_id), payment: await payment.reload(), activated: true };
};

/** Gọi NGƯỢC từ payment.service khi thanh toán thất bại: hủy vé pending. */
export const cancelPassOnPaymentFail = async (passId) => {
  const pass = await MonthlyPass.findByPk(passId);
  if (!pass || pass.status !== 'pending') return pass;
  await pass.update({ status: 'cancelled' });
  return pass;
};
