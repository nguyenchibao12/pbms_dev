import { Op } from 'sequelize';
import sequelize from '../config/db.js';
import {
  ParkingSession,
  VehicleType,
  MonthlyPass,
  Reservation,
} from '../models/index.js';
import { AppError } from '../utils/helpers.js';
import { generateQrToken } from '../utils/qr.js';
import { suggestSlot, lockSlotOccupied, releaseSlot } from '../utils/slotSuggest.js';
import { calculateParkingFee, getEffectivePricingRule } from '../utils/feeCalc.js';
import { isSessionFreeUnderPass, isWithinPassWindow } from '../utils/passWindow.js';
import { logSuggestion } from './aiLog.service.js';
import { validateAndNormalizePlateVN } from '../utils/plateVN.js';
import { assertBuildingOpenForCheckIn } from '../utils/buildingHours.js';
import { resolveFloorGate } from '../utils/gateResolve.js';
import { getMaxParkingHours, getLostTicketFee, getOverstayFee } from '../utils/settings.js';
import { assertSessionActive, buildRevokedQrToken } from '../utils/stateGuards.js';
import { createIncident } from './incident.service.js';
import { parsePagination, paginatedResult } from '../utils/pagination.js';

const sessionIncludes = [
  { association: 'slot', include: [{ association: 'zone', include: [{ association: 'floor' }] }] },
  { association: 'gate', include: [{ association: 'floor' }] },
  { association: 'vehicleType' },
  { association: 'monthlyPass' },
  { association: 'reservation', attributes: ['reservation_id', 'status', 'start_time', 'end_time'] },
  { association: 'checkInStaff', attributes: ['user_id', 'full_name', 'username'] },
  { association: 'checkOutStaff', attributes: ['user_id', 'full_name', 'username'] },
];

const normalizePlate = (plate) => {
  const result = validateAndNormalizePlateVN(plate);
  if (!result.valid) throw new AppError(result.error, 400, 'VALIDATION_ERROR');
  return result.normalized;
};

export const listActiveSessions = async (query = {}) => {
  const pagination = parsePagination(query);
  const limit = Math.min(200, Math.max(pagination.limit, Number(query.limit) || 200));
  const total = await ParkingSession.count({ where: { status: 'active' } });
  const rows = await ParkingSession.findAll({
    where: { status: 'active' },
    include: sessionIncludes,
    order: [['time_in', 'DESC']],
    limit,
    offset: pagination.offset,
  });
  const items = await Promise.all(rows.map(enrichActiveSessionForStaff));
  return paginatedResult(items, total, pagination.page, limit);
};

/** Gắn cảnh báo cho staff: LỐ GIỜ (đỗ quá ngưỡng) + booking confirmed chưa liên kết */
const enrichActiveSessionForStaff = async (session) => {
  const row = session.toJSON();

  // Cảnh báo LỐ GIỜ. Walk-in: vượt ngưỡng chung max_parking_hours (Manager set).
  // Đặt chỗ: vượt end_time của ĐƠN (ngưỡng riêng từng đơn). Vé tháng: khung riêng, monthly lo.
  const maxHours = getMaxParkingHours();
  const isWalkIn = ['walk_in', 'auto_registered'].includes(row.session_type);
  row.overstay = false;
  row.overstayHours = 0;
  row.overstayReason = null;

  if (maxHours != null && isWalkIn && row.time_in) {
    const parkedHours = (Date.now() - new Date(row.time_in).getTime()) / (1000 * 60 * 60);
    if (parkedHours > maxHours) {
      row.overstay = true;
      row.overstayHours = Math.floor(parkedHours - maxHours);
      row.overstayReason = 'walk_in_max_hours';
    }
  } else if (row.reservation_id) {
    const resv = await detectReservationOverstay(session, new Date());
    if (resv.overstay) {
      row.overstay = true;
      row.overstayHours = resv.overstayHours;
      row.overstayReason = 'reservation_window';
    }
  }

  if (row.reservation_id || row.reservation?.status) return row;
  if (!['walk_in', 'auto_registered'].includes(row.session_type)) return row;

  const openBooking = await Reservation.findOne({
    where: {
      plate_number: row.plate_number,
      status: 'confirmed',
    },
    attributes: ['reservation_id', 'status', 'start_time', 'end_time'],
    order: [['start_time', 'ASC']],
  });
  if (openBooking) {
    row.unlinkedReservation = openBooking.toJSON();
  }
  return row;
};

/** Staff — tra cứu phiên active từ QR ra cổng */
export const staffLookupSessionByQr = async (qrToken) => {
  const token = String(qrToken || '').trim();
  if (!token || token.startsWith('revoked-')) {
    throw new AppError('Mã QR không hợp lệ hoặc đã vô hiệu', 400, 'VALIDATION_ERROR');
  }
  const session = await ParkingSession.findOne({
    where: { qr_token: token, status: 'active' },
    include: sessionIncludes,
  });
  if (!session) {
    throw new AppError('Không tìm thấy phiên đang gửi với mã QR này', 404, 'NOT_FOUND');
  }
  return session;
};

export const listMyActiveSessions = async (userId) => {
  const sessions = await ParkingSession.findAll({
    where: { user_id: userId, status: 'active' },
    include: sessionIncludes,
    order: [['time_in', 'DESC']],
  });

  return Promise.all(
    sessions.map(async (session) => {
      const base = session.toJSON();
      try {
        const preview = await previewCheckoutFee({ sessionId: session.session_id });
        return {
          ...base,
          estimatedFee: preview.fee,
          passCovered: preview.passCovered,
          pricingRule: preview.pricingRule,
          overstay: preview.overstay,
        };
      } catch {
        return {
          ...base,
          estimatedFee: null,
          passCovered: false,
          pricingRule: null,
          overstay: false,
        };
      }
    }),
  );
};

export const getSession = async (id) => {
  const session = await ParkingSession.findByPk(id, { include: sessionIncludes });
  if (!session) throw new AppError('Session not found', 404, 'NOT_FOUND');
  return session;
};

const findActiveByPlate = async (plateNumber) =>
  ParkingSession.findOne({
    where: { plate_number: normalizePlate(plateNumber), status: 'active' },
  });

/** Kết thúc phiên active (hủy đặt chỗ / đồng bộ trạng thái) — không thu phí */
export const voidActiveSession = async (session, transaction) => {
  if (!session || session.status !== 'active') return false;

  const locked = await ParkingSession.findByPk(session.session_id, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!locked || locked.status !== 'active') return false;

  await releaseSlot(locked.slot_id, transaction);
  await locked.update(
    {
      time_out: new Date(),
      status: 'exception',
      calculated_fee: 0,
      qr_token: buildRevokedQrToken('session', locked.session_id),
    },
    { transaction },
  );
  return true;
};

export const hasActiveSessionForPlate = async (plateNumber) => {
  const session = await findActiveByPlate(plateNumber);
  return Boolean(session);
};

// Ân hạn VÀO SỚM đã BỎ (=0): đơn chỉ nhận check-in từ ĐÚNG start_time (khớp lúc job khóa-đầu-ca).
// Khách đến sớm hơn vẫn bị WALKIN_BLOCK_BEFORE_RESERVATION_MS chặn walk-in (hướng sang tab "Đặt chỗ vào").
// (SRS BR-31 để 15' — đây là LỆCH SRS có chủ đích, cần cập nhật tài liệu.)
const CHECKIN_EARLY_GRACE_MS = 0;
// Đơn confirmed bắt đầu trong vòng ngưỡng này → coi khách là "đến sớm cho đơn", chặn walk-in.
const WALKIN_BLOCK_BEFORE_RESERVATION_MS = 60 * 60 * 1000;

const findConfirmedReservationForPlate = async (plateNumber, at = new Date()) =>
  Reservation.findOne({
    where: {
      plate_number: plateNumber,
      status: 'confirmed',
      start_time: { [Op.lte]: new Date(at.getTime() + CHECKIN_EARLY_GRACE_MS) },
      end_time: { [Op.gte]: at },
    },
    order: [['start_time', 'ASC']],
  });

export const checkin = async (staffUserId, data) => {
  const plateNumber = normalizePlate(data.plateNumber);

  const existing = await findActiveByPlate(plateNumber);
  if (existing) {
    throw new AppError('Vehicle already has an active session', 409, 'CONFLICT');
  }

  const now = new Date();
  const matchingReservation = await findConfirmedReservationForPlate(plateNumber, now);
  if (matchingReservation) {
    if (matchingReservation.floor_id !== data.floorId) {
      throw new AppError(
        `Biển ${plateNumber} có đặt chỗ xác nhận tại tầng khác — chọn đúng tầng hoặc tab "Đặt chỗ vào"`,
        409,
        'RESERVATION_WRONG_FLOOR',
      );
    }
    if (matchingReservation.vehicle_type_id !== data.vehicleTypeId) {
      throw new AppError(
        `Biển ${plateNumber} có đặt chỗ với loại xe khác — chọn đúng loại xe hoặc tab "Đặt chỗ vào"`,
        409,
        'RESERVATION_VEHICLE_MISMATCH',
      );
    }
    const { checkinReservation } = await import('./reservation.service.js');
    const result = await checkinReservation(staffUserId, {
      reservationId: matchingReservation.reservation_id,
      gateId: data.gateId,
    });
    return getSession(result.session.session_id);
  }

  // Chỉ chặn khi đơn confirmed SẮP tới giờ (trong vòng 60'): khách này là khách đến sớm
  // cho đơn của họ → hướng sang tab "Đặt chỗ vào" (mở sớm tối đa 15'). Đơn còn XA hơn thì
  // cho gửi walk-in bình thường — trước đây chặn MỌI đơn tương lai, khách có đơn tuần sau
  // hôm nay không gửi xe được.
  const nearConfirmed = await Reservation.findOne({
    where: {
      plate_number: plateNumber,
      status: 'confirmed',
      start_time: {
        [Op.gt]: now,
        [Op.lte]: new Date(now.getTime() + WALKIN_BLOCK_BEFORE_RESERVATION_MS),
      },
    },
    order: [['start_time', 'ASC']],
  });
  if (nearConfirmed) {
    throw new AppError(
      `Biển ${plateNumber} có đặt chỗ lúc ${new Date(nearConfirmed.start_time).toLocaleString('vi-VN')} — dùng tab "Đặt chỗ vào" (sớm tối đa 15 phút)`,
      409,
      'RESERVATION_NOT_OPEN',
    );
  }

  // === Vé tháng: nếu biển số có pass active → check-in dạng monthly_pass (calculated_fee = 0) ===
  // Tìm theo biển số (không lọc tầng) để phát hiện trường hợp khách lên SAI TẦNG.
  const { findActivePassByPlate } = await import('./monthlyPass.service.js');
  let activePass = null;
  const passForPlate = await findActivePassByPlate(plateNumber);
  if (passForPlate) {
    if (passForPlate.floor_id !== data.floorId) {
      await createIncident(staffUserId, {
        type: 'wrong_floor',
        description: `Vé tháng biển ${plateNumber} thuộc tầng "${passForPlate.floor?.name || passForPlate.floor_id}", khách quét tại tầng ${data.floorId}`,
        passId: passForPlate.pass_id,
        userId: passForPlate.user_id,
      });
      throw new AppError(
        `Biển ${plateNumber} có vé tháng ở tầng "${passForPlate.floor?.name || passForPlate.floor_id}" — vui lòng lên đúng tầng đó để quét`,
        409,
        'PASS_WRONG_FLOOR',
      );
    }
    if (passForPlate.vehicle_type_id !== data.vehicleTypeId) {
      throw new AppError(
        `Vé tháng của biển ${plateNumber} đăng ký loại xe khác — chọn đúng loại xe`,
        409,
        'PASS_VEHICLE_MISMATCH',
      );
    }
    // Trong khung giờ pass → miễn phí; ngoài khung giờ → bỏ qua, xử lý như walk-in (tính phí).
    if (isWithinPassWindow(passForPlate, now)) {
      activePass = passForPlate;
    }
  }

  // Cổng IN: nếu staff không gửi gateId, tự suy cổng vào duy nhất của tầng.
  const gate = await resolveFloorGate({
    floorId: data.floorId,
    direction: 'in',
    gateId: data.gateId,
    vehicleTypeId: data.vehicleTypeId,
  });

  const vehicleType = await VehicleType.findByPk(data.vehicleTypeId);
  if (!vehicleType) throw new AppError('Vehicle type not found', 404, 'NOT_FOUND');

  assertBuildingOpenForCheckIn(now);
  const timeIn = now;

  const { slot: suggestedSlot, meta: suggestMeta } = await suggestSlot({
    floorId: data.floorId,
    vehicleTypeId: data.vehicleTypeId,
    zoneId: data.zoneId,
    // Người CÓ VÉ THÁNG vào qua quầy: miễn lớp giữ-chỗ-cho-đơn-đặt (cam kết vé đi trước);
    // walk-in thường vẫn phải chừa chỗ cho đơn sắp tới.
    skipReservationHoldback: Boolean(activePass),
  });

  const qrToken = generateQrToken();
  const sessionType = activePass
    ? 'monthly_pass'
    : data.sessionType === 'auto_registered'
      ? 'auto_registered'
      : 'walk_in';

  const session = await sequelize.transaction(async (transaction) => {
    await lockSlotOccupied(suggestedSlot.slot_id, transaction);

    return ParkingSession.create(
      {
        user_id: activePass ? activePass.user_id : data.userId || null,
        pass_id: activePass ? activePass.pass_id : null,
        gate_id: gate.gate_id,
        slot_id: suggestedSlot.slot_id,
        vehicle_type_id: data.vehicleTypeId,
        plate_number: plateNumber,
        time_in: timeIn,
        qr_token: qrToken,
        check_in_by: staffUserId,
        session_type: sessionType,
        status: 'active',
        calculated_fee: activePass ? 0 : null,
      },
      { transaction }
    );
  });

  await logSuggestion({
    ...suggestMeta,
    sessionId: session.session_id,
    context: activePass ? 'monthly' : 'walk_in',
  });

  return getSession(session.session_id);
};

// 2 hàm dưới chỉ là CỬA sang payment.service, không chứa logic. `await import()` động là cố ý:
// payment.service import ngược lại file này → import tĩnh 2 chiều tạo vòng lặp, một bên thấy undefined.
export const checkout = async (staffUserId, data) => {
  const { initiateSessionCheckout } = await import('./payment.service.js');
  return initiateSessionCheckout(staffUserId, data);
};

export const cashCheckout = async (staffUserId, data) => {
  const { settleCashCheckout } = await import('./payment.service.js');
  return settleCashCheckout(staffUserId, data);
};

// Ân hạn lấy xe sau khi hết khung giờ đã đặt. Chủ module chốt BỎ (=0): quá end_time là tính phụ thu
// ngay từ phút đầu (đối xứng với việc bỏ ân hạn check-in sớm). No-show (job) cũng đã bỏ ân hạn qua
// booking_no_show_grace_minutes=0 — 2 núm giờ khai riêng nhưng cùng chốt = 0.
const RESERVATION_OVERSTAY_GRACE_MS = 0;

/**
 * Lố giờ của ĐẶT CHỖ — khác walk-in: ngưỡng là `end_time` của ĐƠN, không phải max_parking_hours.
 * Ở quá khung đã đặt là giữ mất chỗ của người đặt ca kế tiếp → thu phụ thu như walk-in lố giờ.
 * (Không dùng import từ reservation.service để tránh vòng lặp import — file đó đã import file này.)
 */
const detectReservationOverstay = async (session, feeEnd) => {
  const none = { overstay: false, overstayHours: 0 };
  if (!session?.reservation_id) return none;

  const reservation = await Reservation.findByPk(session.reservation_id);
  if (!reservation?.end_time) return none;

  const endTime = new Date(reservation.end_time);
  const overMs = feeEnd.getTime() - endTime.getTime();
  if (overMs <= RESERVATION_OVERSTAY_GRACE_MS) return none;

  // Số giờ tính TỪ end_time (không trừ ân hạn) — ân hạn chỉ để quyết định CÓ thu hay không.
  return { overstay: true, overstayHours: Math.floor(overMs / (1000 * 60 * 60)) };
};

/**
 * Xem trước phí — tính tiền nhưng KHÔNG thu, không đụng phiên. Phải khớp con số lúc chốt thật nên
 * cùng dùng feeCalc + cùng lấy mốc left_floor_at như `completeSessionAfterPayment`.
 */
export const previewCheckoutFee = async (data) => {
  let session;

  // 2 kiểu nhận diện vì khách cầm 2 loại QR: vãng lai cầm QR PHIÊN, đặt chỗ cầm QR ĐƠN ĐẶT.
  if (data.sessionId) {
    session = await ParkingSession.findByPk(data.sessionId);
  } else if (data.qrToken) {
    session = await ParkingSession.findOne({ where: { qr_token: data.qrToken } });
    // Khách đặt chỗ cầm QR ĐẶT CHỖ (không phải QR phiên) — map sang phiên active của đơn.
    if (!session) {
      const resv = await Reservation.findOne({ where: { qr_token: data.qrToken } });
      if (resv) {
        session = await ParkingSession.findOne({
          where: { reservation_id: resv.reservation_id, status: 'active' },
        });
      }
    }
  } else if (data.plateNumber) {
    session = await findActiveByPlate(data.plateNumber);
  } else {
    throw new AppError('Provide sessionId, qrToken, or plateNumber', 400, 'VALIDATION_ERROR');
  }

  if (!session || session.status !== 'active') {
    throw new AppError('Active session not found', 404, 'NOT_FOUND');
  }

  const now = new Date();
  // Mốc CHỐT phí: nếu xe đã rời tầng (quét cổng tầng OUT) thì tính phí tới mốc đó,
  // không tính thời gian đi từ tầng ra cổng tòa. Chưa rời tầng → tính tới hiện tại.
  const feeEnd = session.left_floor_at ? new Date(session.left_floor_at) : now;

  if (session.pass_id && session.session_type === 'monthly_pass') {
    const pass = await MonthlyPass.findByPk(session.pass_id);
    if (pass && isSessionFreeUnderPass(pass, session.time_in, feeEnd)) {
      const fullSession = await getSession(session.session_id);
      return {
        session: fullSession,
        fee: 0,
        pricingRule: null,
        passCovered: true,
      };
    }
  }

  const pricingRule = await getEffectivePricingRule(session.vehicle_type_id, feeEnd);
  let fee = calculateParkingFee(session.time_in, feeEnd, pricingRule);

  const lostTicket = Boolean(data.lostTicket);
  const lostTicketFee = lostTicket
    ? Number(data.lostTicketFee ?? getLostTicketFee())
    : 0;
  if (lostTicket) fee += lostTicketFee;

  // LỐ GIỜ — phát hiện theo CHÍNH phiên (tra bằng QR/biển số → time_in), chỉ walk-in, so ngưỡng
  // max_parking_hours (Manager set). Đã lố giờ thì BẮT BUỘC thu 100% — enforce server-side:
  // staff bỏ tick vẫn bị cộng phụ thu (overstay_fee Manager set) để không nhầm/quên/bỏ sót.
  // Ngoài ra staff vẫn có thể chủ động tick khi chưa cấu hình ngưỡng. Đặt chỗ / vé tháng lo khung riêng.
  const maxHours = getMaxParkingHours();
  const isWalkIn = ['walk_in', 'auto_registered'].includes(session.session_type);
  const parkedHours = (feeEnd.getTime() - new Date(session.time_in).getTime()) / (1000 * 60 * 60);
  const walkInOverstay = maxHours != null && isWalkIn && parkedHours > maxHours;

  // ĐẶT CHỖ lố giờ: "ngưỡng" không phải max_parking_hours mà là end_time của ĐƠN — ở quá khung
  // đã đặt là chiếm chỗ của người đặt ca sau. Ân hạn 15 phút cho khách lấy xe (đối xứng với
  // ân hạn check-in sớm 15 phút bên reservation.service).
  const resvOverstay = await detectReservationOverstay(session, feeEnd);

  const overstay = walkInOverstay || resvOverstay.overstay;
  const overstayHours = walkInOverstay
    ? Math.floor(parkedHours - maxHours)
    : resvOverstay.overstayHours;
  const overstayReason = walkInOverstay
    ? 'walk_in_max_hours'
    : resvOverstay.overstay
      ? 'reservation_window'
      : null;

  // enforced = hệ thống bắt buộc thu (đã phát hiện lố giờ). charge = thực tế có cộng phụ thu.
  const overstayEnforced = overstay;
  const overstayCharge = overstayEnforced || Boolean(data.overstayCharge);
  const overstayFee = overstayCharge ? getOverstayFee() : 0;
  if (overstayCharge) fee += overstayFee;

  const fullSession = await getSession(session.session_id);

  return {
    session: fullSession,
    fee,
    pricingRule: { unit: pricingRule.unit, baseRate: pricingRule.base_rate },
    passCovered: false,
    overstay, // đã phát hiện lố giờ (theo phiên/QR/biển số)
    overstayHours,
    overstayReason, // 'walk_in_max_hours' | 'reservation_window' | null — để staff/FE nói đúng lý do
    overstayEnforced, // true = bắt buộc thu, staff không bỏ được
    overstayCharge, // thực tế có cộng phụ thu lố giờ
    overstayFee, // mức phụ thu đã cộng (0 nếu không thu)
    lostTicket,
    lostTicketFee: lostTicket ? lostTicketFee : 0,
  };
};

export const correctSessionPlate = async (staffUserId, sessionId, plateNumber) => {
  const session = await ParkingSession.findByPk(sessionId);
  if (!session) throw new AppError('Session not found', 404, 'NOT_FOUND');
  assertSessionActive(session);

  const normalized = normalizePlate(plateNumber);
  if (normalized === session.plate_number) {
    return getSession(sessionId);
  }

  const duplicate = await ParkingSession.findOne({
    where: { plate_number: normalized, status: 'active' },
  });
  if (duplicate && duplicate.session_id !== session.session_id) {
    throw new AppError('Plate already has an active session', 409, 'PLATE_DUPLICATE_ACTIVE');
  }

  const oldPlate = session.plate_number;
  await session.update({ plate_number: normalized });

  await createIncident(staffUserId, {
    type: 'wrong_info',
    description: `Corrected plate: ${oldPlate} → ${normalized}`,
    sessionId: session.session_id,
    slotId: session.slot_id,
    userId: session.user_id,
  });

  return getSession(sessionId);
};
