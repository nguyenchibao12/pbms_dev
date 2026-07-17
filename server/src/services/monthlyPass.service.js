import { Op } from 'sequelize';
import sequelize from '../config/db.js';
import { MonthlyPass, Payment, Floor, VehicleType, ParkingSession, RefundRequest } from '../models/index.js';
import { AppError } from '../utils/helpers.js';
import { generateQrToken } from '../utils/qr.js';
import { buildRevokedQrToken } from '../utils/stateGuards.js';
import { getPassRefundPolicy } from '../utils/settings.js';
import {
  createPayOSPaymentLink,
  generateOrderCode,
  getPayOSPaymentInfo,
  cancelPayOSPaymentLink,
} from './payos.client.js';
import { normalizeTimeInput, isWithinPassWindow } from '../utils/passWindow.js';
import { suggestSlot, lockSlotOccupied } from '../utils/slotSuggest.js';
import { logSuggestion } from './aiLog.service.js';
import { validateAndNormalizePlateVN } from '../utils/plateVN.js';
import { getPassCapacity } from '../utils/passCapacity.js';
import {
  getMonthlyPassPrice as getPassPriceFromSettings,
  getBuildingSettingsSync,
} from '../utils/settings.js';
import { parsePagination, findAndPaginate } from '../utils/pagination.js';
import { recordPassWindowViolation } from './incident.service.js';
import { logAdminAction } from '../utils/auditLog.js';

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

/**
 * P3-9 — Staff/Manager tra cứu vé tháng: lọc theo status / tầng / biển số, phân trang.
 * Staff dùng tra nhanh "biển này có vé không"; Manager xem tổng thể theo tầng.
 */
export const listPasses = async ({ status, floorId, plate, page, limit } = {}) => {
  const where = {};
  if (status) where.status = status;
  if (floorId) where.floor_id = Number(floorId);
  if (plate) {
    // Tìm gần đúng theo biển (bỏ ký tự phân cách để '51A12345' vẫn khớp '51A-123.45')
    const compact = String(plate).replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
    where[Op.and] = sequelize.where(
      sequelize.fn('REPLACE', sequelize.fn('REPLACE', sequelize.col('monthly_pass.plate_number'), '-', ''), '.', ''),
      { [Op.like]: `%${compact}%` },
    );
  }

  const pagination = parsePagination({ page, limit });
  const result = await findAndPaginate(MonthlyPass, {
    where,
    include: passIncludes,
    order: [['created_at', 'DESC']],
    ...pagination,
  });
  return result;
};

/**
 * Đếm vé pending+active OVERLAP với khoảng [from, to] (mặc định = hôm nay, giữ nguyên
 * hành vi cũ cho GET /capacity). Mua vé truyền khoảng của vé MỚI: vé mua trước cho
 * tháng sau không ăn suất của tháng này, và ngược lại (P3-7).
 */
export const countPassCapacityUsage = async (
  floorId,
  vehicleTypeId,
  { from = null, to = null, transaction = null } = {},
) => {
  const today = new Date().toISOString().slice(0, 10);
  const rangeFrom = from || today;
  const rangeTo = to || today;
  return MonthlyPass.count({
    where: {
      floor_id: floorId,
      vehicle_type_id: vehicleTypeId,
      // pending CŨNG tính (đang giữ suất chờ trả tiền); quá TTL 15' job tự hủy nên không kẹt suất.
      status: { [Op.in]: ['pending', 'active'] },
      // 2 dòng này = phép OVERLAP khoảng ngày: vé tháng 8 không ăn suất tháng 7 ⇒ gia hạn sớm được.
      start_date: { [Op.lte]: rangeTo },
      end_date: { [Op.gte]: rangeFrom },
    },
    ...(transaction ? { transaction } : {}),
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

  const price = getMonthlyPassPrice();

  // P2-4: đếm-rồi-tạo trong MỘT transaction, khóa row Zone của (floor, vehicleType)
  // bằng LOCK.UPDATE — request mua thứ 2 phải chờ request 1 commit mới đếm được,
  // hết cửa 2 request cùng thấy "còn 1 suất" rồi cùng tạo vé (bán vượt capacity).
  const { pass, capacity, used } = await sequelize.transaction(async (transaction) => {
    const cap = await getPassCapacity(data.floorId, data.vehicleTypeId, {
      transaction,
      // Khóa ngay ở bước ĐẾM chứ không phải bước ghi: khóa lúc ghi thì cả 2 request đã đếm xong và
      // đều tin "còn suất". Khóa từ lúc đọc thì request 2 phải chờ commit rồi đếm lại → thấy hết suất.
      lock: transaction.LOCK.UPDATE,
    });
    if (cap <= 0) {                                   // 0 = khu CHƯA MỞ BÁN (không phải "hết suất")
      throw new AppError(                             //   → mã lỗi riêng để FE báo đúng câu
        'Tầng/loại xe này chưa mở bán vé tháng — vui lòng chọn tầng hoặc loại xe khác',
        409,
        'PASS_NOT_AVAILABLE',
      );
    }

    // P3-7: capacity + check trùng xét theo OVERLAP với khoảng của vé MỚI (không phải
    // "hôm nay") → khách đang có vé tháng này vẫn mua trước được vé tháng sau (gia hạn).
    const usage = await countPassCapacityUsage(data.floorId, data.vehicleTypeId, {
      from: startDate,
      to: endDate,
      transaction,
    });
    if (usage >= cap) {
      throw new AppError('Monthly pass capacity full for this floor', 409, 'CONFLICT');
    }

    const overlapping = await MonthlyPass.findOne({
      where: {
        plate_number: plateNumber,
        floor_id: data.floorId,
        status: { [Op.in]: ['pending', 'active'] },
        start_date: { [Op.lte]: endDate },
        end_date: { [Op.gte]: startDate },
      },
      transaction,
    });
    if (overlapping) {
      throw new AppError(
        'Biển số này đã có vé trùng khoảng ngày trên tầng này — vé mới phải bắt đầu sau khi vé cũ kết thúc',
        409,
        'CONFLICT',
      );
    }

    const created = await MonthlyPass.create(
      {
        user_id: userId,
        vehicle_type_id: data.vehicleTypeId,
        floor_id: data.floorId,
        plate_number: plateNumber,
        valid_from_time: fromTime,
        valid_to_time: toTime,
        start_date: startDate,
        end_date: endDate,
        status: 'pending',
      },
      { transaction },
    );
    return { pass: created, capacity: cap, used: usage };
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
 * P2-6 — Lấy lại link thanh toán cho vé pending (khách tắt tab PayOS giữa chừng).
 * Link cũ còn PENDING trên PayOS → trả lại (không tạo giao dịch thừa); không thì
 * đánh dấu payment cũ failed rồi sinh orderCode + link + Payment pending mới.
 */
/**
 * "Trả tiếp" — chống THU TIỀN 2 LẦN. Không tin DB mình mà HỎI PayOS trạng thái thật:
 * PENDING → trả lại link cũ · PAID → kích hoạt luôn · không chắc → hủy thật, hủy không xong thì 502.
 */
export const repayMonthlyPass = async (userId, passId) => {
  const pass = await MonthlyPass.findByPk(passId);
  if (!pass) throw new AppError('Monthly pass not found', 404, 'NOT_FOUND');
  if (pass.user_id !== userId) throw new AppError('Not allowed', 403, 'FORBIDDEN');   // vé người khác
  if (pass.status !== 'pending') {
    throw new AppError(`Vé không ở trạng thái chờ thanh toán (hiện tại: ${pass.status})`, 409, 'CONFLICT');
  }

  const oldPayment = await Payment.findOne({
    where: { pass_id: pass.pass_id, status: 'pending' },
    order: [['created_at', 'DESC']],
  });

  if (oldPayment) {
    let info = null;
    try {
      info = await getPayOSPaymentInfo(oldPayment.order_code);   // hỏi PAYOS, không tin DB mình
    } catch {
      // Nuốt lỗi là cố ý: null rơi xuống nhánh "không chắc" bên dưới, ở đó mới fail-closed.
      info = null;
    }

    // Link cũ còn sống → trả lại chính nó, không đẻ giao dịch thừa.
    if (info?.status === 'PENDING') {
      const stored = JSON.parse(oldPayment.gateway_response || '{}');
      if (stored.checkoutUrl) {
        return { pass, payment: oldPayment, checkoutUrl: stored.checkoutUrl, reused: true };
      }
    }

    // Tiền ĐÃ về nhưng webhook chưa tới (localhost không có webhook) → kích hoạt vé luôn,
    // tuyệt đối không phát link mới: phát nữa là khách trả tiền lần hai cho cùng một vé.
    if (info?.status === 'PAID') {
      await activatePassAfterPayment(oldPayment);
      return {
        pass: await getPass(pass.pass_id),
        payment: await Payment.findByPk(oldPayment.payment_id),
        checkoutUrl: null,
        alreadyPaid: true,
        reused: false,
      };
    }

    // Sắp phát link MỚI → phải chắc chắn link cũ đã chết Ở PHÍA PAYOS. Chỉ đánh dấu 'failed'
    // trong DB mình là chưa đủ: đơn cũ vẫn thanh toán được → hai link cùng sống → thu tiền 2 lần.
    if (info?.status !== 'CANCELLED') {
      try {
        await cancelPayOSPaymentLink(oldPayment.order_code);
      } catch (err) {
        // Hủy lỗi: có thể đơn đã chết sẵn (PayOS ném lỗi) — cũng có thể do mạng. Hỏi lại;
        // còn PENDING hoặc vẫn không tra được thì DỪNG, không phát link thứ hai.
        const recheck = await getPayOSPaymentInfo(oldPayment.order_code).catch(() => null);
        if (!recheck || recheck.status === 'PENDING') {
          console.error('[repayMonthlyPass] không hủy được link cũ:', err.message);
          throw new AppError(
            'Chưa hủy được liên kết thanh toán cũ — vui lòng thử lại sau giây lát',
            502,
            'PAYMENT_GATEWAY_ERROR',
          );
        }
      }
    }
    await oldPayment.update({ status: 'failed' });   // chỉ đánh failed SAU khi chắc link cũ đã chết
  }

  // Giữ đúng giá lúc mua (snapshot trên payment cũ); vé chưa từng có payment → giá hiện hành.
  // Manager có thể vừa đổi giá trong Settings — khách bấm mua 500k thì trả tiếp cũng phải 500k.
  const amount = oldPayment ? Number(oldPayment.amount) : getMonthlyPassPrice();
  try {
    const orderCode = generateOrderCode();
    const payosResult = await createPayOSPaymentLink({
      orderCode,
      amount,
      description: `Pass ${pass.plate_number}`,
      returnUrl: `${process.env.CLIENT_URL}/monthly-pass`,
      cancelUrl: `${process.env.CLIENT_URL}/monthly-pass`,
    });
    const payment = await Payment.create({
      pass_id: pass.pass_id,
      order_code: orderCode,
      amount,
      status: 'pending',
      method: 'payos',
      gateway_transaction_id: payosResult.paymentLinkId ? String(payosResult.paymentLinkId) : null,
      gateway_response: JSON.stringify(payosResult),
    });
    return { pass, payment, checkoutUrl: payosResult.checkoutUrl, reused: false };
  } catch (err) {
    // KHÔNG hủy vé ở đây (khác lúc mua): khách có thể bấm repay lại;
    // vé pending bỏ quên quá TTL đã có job passMaintenance dọn.
    console.error('[repayMonthlyPass] tạo thanh toán PayOS lỗi:', err.message);
    throw new AppError('Không tạo được liên kết thanh toán — vui lòng thử lại', 502, 'PAYMENT_GATEWAY_ERROR');
  }
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

  // Tiền về SAU khi vé đã bị hủy/hết hạn (job passMaintenance hủy pending quá TTL, hoặc user
  // hủy pending rồi mới trả) → KHÔNG hồi sinh vé. Payment giữ 'success' (tiền ĐÃ về thật) +
  // tạo RefundRequest 100% cho trang hoàn tiền của Admin — completeRefund mới đổi payment sang
  // 'refunded'. Đối xứng với confirmReservationAfterPayment (nhánh cancelled). Nếu KHÔNG xử lý,
  // activate sẽ ném CONFLICT, tiền kẹt mà không có yêu cầu hoàn nào → mất tiền âm thầm.
  // Idempotent: webhook/verify có thể gọi lặp → đã có refund_request cho payment này thì bỏ qua.
  if (pass.status === 'cancelled' || pass.status === 'expired') {
    const existingRefund = await RefundRequest.findOne({
      where: { payment_id: payment.payment_id },
    });
    await sequelize.transaction(async (transaction) => {
      if (payment.status !== 'success') {
        await payment.update({ status: 'success', paid_at: new Date() }, { transaction });
      }
      if (!existingRefund) {
        await RefundRequest.create(
          {
            pass_id: pass.pass_id,
            payment_id: payment.payment_id,
            user_id: pass.user_id,
            percent: 100,
            amount: Number(payment.amount),
            status: 'pending',
            requested_at: new Date(),
          },
          { transaction },
        );
      }
    });
    if (!existingRefund) {
      await logAdminAction(pass.user_id, 'PASS_REFUND_OWED', {
        passId: pass.pass_id,
        amount: Number(payment.amount),
        note: 'Thanh toán về sau khi vé tháng đã hủy/hết hạn — đã tạo yêu cầu hoàn tiền',
      });
    }
    return {
      pass: await getPass(pass.pass_id),
      payment: await payment.reload(),
      activated: false,
      refunded: true,
      refundRequested: !existingRefund,
    };
  }

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

/**
 * Check-in tại KIOSK bằng QR vé tháng (không có staff) — bắt chước checkIn booth
 * (session.service): gợi ý slot theo tầng/loại xe của vé, chiếm slot trong transaction,
 * tạo phiên monthly_pass miễn phí. Gọi từ gateScan.buildingEntry khi quét pass chưa có phiên.
 * NGOÀI khung giờ hằng ngày của vé → CHẶN (không tự tạo phiên walk-in tính phí mà khách
 * không biết trước) — hướng dẫn qua booth gặp staff.
 */
export const checkinWithPass = async (pass, { gateId = null } = {}) => {
  const now = new Date();
  if (!isWithinPassWindow(pass, now)) {
    // Ghi vết audit (không chặn luồng nếu ghi lỗi) rồi chặn cứng.
    await recordPassWindowViolation({
      passId: pass.pass_id,
      userId: pass.user_id,
      plateNumber: pass.plate_number,
      gateId,
    });
    throw new AppError(
      'Vé tháng đang ngoài khung giờ hiệu lực — vui lòng qua quầy gặp nhân viên nếu muốn gửi xe tính phí',
      409,
      'PASS_OUTSIDE_WINDOW',
    );
  }

  // Chống 2 phiên cho cùng 1 xe: biển của vé đang có phiên active (vd walk-in tạo ở
  // booth ngoài khung giờ) → không tạo thêm phiên pass. Pre-check nhanh (khỏi gợi ý slot nếu
  // xe đã trong bãi); chống RACE quét-2-lần thì re-check trong transaction dưới (khoá row vé).
  const existingForPlate = await ParkingSession.findOne({
    where: { plate_number: pass.plate_number, status: 'active' },
  });
  if (existingForPlate) {
    throw new AppError('Xe đã có phiên đang gửi — không thể mở cổng vào lần nữa.', 409, 'ALREADY_PARKED');
  }

  const { slot, meta } = await suggestSlot({
    floorId: pass.floor_id,
    vehicleTypeId: pass.vehicle_type_id,
  });

  const qrToken = generateQrToken();
  const session = await sequelize.transaction(async (transaction) => {
    // Khoá row vé: 2 lần quét CÙNG vé phải xếp hàng (như purchaseMonthlyPass khoá Zone). Sau khi
    // giành được khoá, re-check phiên active của biển — thấy được phiên vừa COMMIT bởi request
    // song song → chặn tạo phiên thứ 2 cho cùng 1 vé/biển.
    await MonthlyPass.findByPk(pass.pass_id, { transaction, lock: transaction.LOCK.UPDATE });
    const raceDup = await ParkingSession.findOne({
      where: { plate_number: pass.plate_number, status: 'active' },
      transaction,
    });
    if (raceDup) {
      throw new AppError('Xe đã có phiên đang gửi — không thể mở cổng vào lần nữa.', 409, 'ALREADY_PARKED');
    }
    await lockSlotOccupied(slot.slot_id, transaction);
    return ParkingSession.create(
      {
        user_id: pass.user_id,
        pass_id: pass.pass_id,
        gate_id: gateId,
        slot_id: slot.slot_id,
        vehicle_type_id: pass.vehicle_type_id,
        plate_number: pass.plate_number,
        time_in: now,
        qr_token: qrToken,
        // Kiosk không có staff — khách tự check-in bằng vé của mình (giống checkinReservation
        // ở kiosk: actor = chủ vé; cột NOT NULL).
        check_in_by: pass.user_id,
        session_type: 'monthly_pass',
        status: 'active',
        calculated_fee: 0,
      },
      { transaction },
    );
  });

  await logSuggestion({ ...meta, sessionId: session.session_id, context: 'monthly' });
  return session;
};

// Chính sách hoàn tiền hiện hành (đọc từ settings) — cho FE hiện đúng số ở modal hủy vé, thay vì
// hardcode mốc cũ. Qua service để controller không phải import util thẳng (giữ controller→service).
export const getRefundPolicy = () => getPassRefundPolicy();

/**
 * P3-8 — % hoàn tiền theo chính sách (đã chốt với nhóm):
 * - Chưa tới ngày hiệu lực (hủy trước start_date): 100%
 * - 3 ngày đầu hiệu lực ("dùng thử"):              70%
 * - Ngày 4 → hết NỬA thời hạn vé:                  50%
 * - Quá nửa thời hạn:                               0%
 * Các mốc đọc từ settings (pass_refund_*), tính theo NGÀY (vé hiệu lực theo DATEONLY).
 */
export const computePassRefundPercent = (pass, now = new Date()) => {
  const policy = getPassRefundPolicy();
  const DAY = 24 * 3600 * 1000;
  // Phải nối "T00:00:00": new Date("2026-07-17") bị parse là UTC → lệch 7 tiếng ở giờ VN, hủy sát
  // nửa đêm sẽ tính nhầm sang ngày khác và trả sai % hoàn.
  const start = new Date(`${String(pass.start_date).slice(0, 10)}T00:00:00`);
  const end = new Date(`${String(pass.end_date).slice(0, 10)}T00:00:00`);
  const today = new Date(now); today.setHours(0, 0, 0, 0);   // cắt giờ: chính sách tính theo NGÀY

  const dayIndex = Math.floor((today - start) / DAY) + 1; // ngày hiệu lực thứ mấy (start = ngày 1)
  if (dayIndex <= 0) return 100;                       // hủy TRƯỚC ngày hiệu lực → chưa dùng gì → 100%
  if (dayIndex <= policy.trialDays) return policy.trialPercent;
  const totalDays = Math.floor((end - start) / DAY) + 1;
  if (dayIndex <= Math.floor(totalDays / 2)) return policy.halfTermPercent;
  return 0;                                            // quá nửa hạn: đã dùng phần lớn vé → không hoàn
};

/**
 * P3-8 — User hủy vé của mình.
 * - Vé pending: hủy luôn (chưa trả tiền, không có gì để hoàn).
 * - Vé active: chặn nếu xe ĐANG trong bãi; hủy + thu hồi QR; nếu % hoàn > 0 và vé đã
 *   thanh toán thành công → tạo RefundRequest cho trang hoàn tiền của Admin
 *   (admin chuyển khoản TAY — PayOS không có API refund tự động).
 */
export const cancelMonthlyPassByUser = async (userId, passId) => {
  const pass = await MonthlyPass.findByPk(passId);
  if (!pass) throw new AppError('Monthly pass not found', 404, 'NOT_FOUND');
  if (pass.user_id !== userId) throw new AppError('Not allowed', 403, 'FORBIDDEN');

  if (pass.status === 'pending') {
    await pass.update({ status: 'cancelled' });
    return {
      pass,
      refund: null,
      message: 'Đã hủy vé (vé chưa thanh toán nên không phát sinh hoàn tiền)',
    };
  }
  if (pass.status !== 'active') {
    throw new AppError(`Vé không thể hủy (trạng thái hiện tại: ${pass.status})`, 409, 'CONFLICT');
  }

  const activeSession = await ParkingSession.findOne({
    where: { pass_id: pass.pass_id, status: 'active' },
  });
  if (activeSession) {
    throw new AppError('Xe đang trong bãi — vui lòng lấy xe ra trước khi hủy vé', 409, 'CONFLICT');
  }

  const percent = computePassRefundPercent(pass);
  const paidPayment = await Payment.findOne({
    where: { pass_id: pass.pass_id, status: 'success' },
    order: [['created_at', 'DESC']],
  });
  const policy = getPassRefundPolicy();

  const refund = await sequelize.transaction(async (transaction) => {
    await pass.update(
      { status: 'cancelled', qr_token: buildRevokedQrToken('pass', pass.pass_id) },
      { transaction },
    );
    if (percent <= 0 || !paidPayment) return null;
    return RefundRequest.create(
      {
        pass_id: pass.pass_id,
        payment_id: paidPayment.payment_id,
        user_id: pass.user_id,
        percent,
        amount: Math.round((Number(paidPayment.amount) * percent) / 100),
        status: 'pending',
        requested_at: new Date(),
      },
      { transaction },
    );
  });

  return {
    pass,
    refund,
    percent,
    message: refund
      ? `Đã hủy vé. Bạn được hoàn ${percent}% = ${Number(refund.amount).toLocaleString('vi-VN')}đ — ` +
        `vui lòng cập nhật tài khoản ngân hàng trong hồ sơ trong vòng ${policy.bankInfoTtlDays} ngày để nhận tiền.`
      : 'Đã hủy vé. Theo chính sách, vé không còn được hoàn tiền.',
  };
};

/** Gọi NGƯỢC từ payment.service khi thanh toán thất bại: hủy vé pending. */
export const cancelPassOnPaymentFail = async (passId) => {
  const pass = await MonthlyPass.findByPk(passId);
  if (!pass || pass.status !== 'pending') return pass;
  await pass.update({ status: 'cancelled' });
  return pass;
};
