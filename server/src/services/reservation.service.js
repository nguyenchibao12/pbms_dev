import { Op } from 'sequelize';
import sequelize from '../config/db.js';
import {
  Reservation,
  Payment,
  ParkingSession,
  ParkingSlot,
  Gate,
  Floor,
  VehicleType,
} from '../models/index.js';
import { AppError } from '../utils/helpers.js';
import { generateQrToken } from '../utils/qr.js';
import {
  suggestSlot,
  lockSlotReserved,
  releaseReservedSlot,
  releaseSlot,
  occupyReservedSlot,
} from '../utils/slotSuggest.js';
import { resolveZoneIds, findSlotsAvailableForWindow } from '../utils/slotWindow.js';
import { buildScoreReason } from '../utils/slotScoring.js';
import { createPayOSPaymentLink, generateOrderCode } from './payos.client.js';
import { logSuggestion } from './aiLog.service.js';
import { getParkingInsights, getUserParkingPreferences } from './prediction.service.js';
import { getSession } from './session.service.js';
import { recordWrongFloorIncident, recordIncident } from './incident.service.js';
import { validateAndNormalizePlateVN } from '../utils/plateVN.js';
import { assertGateVehicleType } from '../utils/gateVehicle.js';
import { assertReservationTransition, buildRevokedQrToken } from '../utils/stateGuards.js';
import { resolveShiftWindow } from '../utils/shifts.js';
import {
  getBookingFee as getBookingFeeFromSettings,
  getBookingRefundCutoffHours,
} from '../utils/settings.js';
import { logAdminAction } from '../utils/auditLog.js';

const CHECKIN_EARLY_GRACE_MS = 15 * 60 * 1000;

const reservationIncludes = [
  { association: 'slot', include: [{ association: 'zone', include: [{ association: 'floor' }] }] },
  { association: 'floor' },
  { association: 'zone' },
  { association: 'vehicleType' },
  { association: 'user', attributes: ['user_id', 'full_name', 'username', 'email'] },
  { association: 'payments' },
];

export const getBookingFee = () => getBookingFeeFromSettings();

const normalizePlate = (plate) => {
  const result = validateAndNormalizePlateVN(plate);
  if (!result.valid) throw new AppError(result.error, 400, 'VALIDATION_ERROR');
  return result.normalized;
};

/**
 * Khung đặt chỗ do hệ thống định nghĩa qua CA cố định (shiftId + arrivalDate).
 * Vẫn chấp nhận startTime/endTime tuyệt đối để tương thích ngược.
 */
const resolveBookingWindow = (data) => {
  if (data.shiftId) {
    const win = resolveShiftWindow(data.arrivalDate, data.shiftId);
    if (!win) throw new AppError('Ca không hợp lệ hoặc thiếu ngày đến', 400, 'VALIDATION_ERROR');
    return { startTime: win.start, endTime: win.end, shiftId: data.shiftId };
  }
  return {
    startTime: new Date(data.startTime),
    endTime: new Date(data.endTime),
    shiftId: null,
  };
};

export const getReservation = async (id) => {
  const reservation = await Reservation.findByPk(id, { include: reservationIncludes });
  if (!reservation) throw new AppError('Reservation not found', 404, 'NOT_FOUND');
  return reservation;
};

export const listUserReservations = async (userId) =>
  Reservation.findAll({
    where: { user_id: userId },
    include: reservationIncludes,
    order: [['start_time', 'DESC']],
  });

/**
 * Đếm chỗ còn trống trong một khung giờ (CA hoặc start/end) cho preview trước khi đặt.
 * Chỉ đọc — không tạo reservation, không giữ slot.
 */
export const getWindowAvailability = async (data) => {
  const { startTime, endTime } = resolveBookingWindow(data);

  if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
    throw new AppError('Invalid start or end time', 400, 'VALIDATION_ERROR');
  }
  if (endTime <= startTime) {
    throw new AppError('endTime must be after startTime', 400, 'VALIDATION_ERROR');
  }
  if (startTime < new Date()) {
    throw new AppError('startTime must be in the future', 400, 'VALIDATION_ERROR');
  }

  const floor = await Floor.findByPk(data.floorId);
  if (!floor) throw new AppError('Floor not found', 404, 'NOT_FOUND');

  const vehicleType = await VehicleType.findByPk(data.vehicleTypeId);
  if (!vehicleType) throw new AppError('Vehicle type not found', 404, 'NOT_FOUND');

  const zoneIds = await resolveZoneIds({
    floorId: data.floorId,
    vehicleTypeId: data.vehicleTypeId,
    zoneId: data.zoneId,
  });

  if (zoneIds.length === 0) {
    return {
      floorId: data.floorId,
      vehicleTypeId: data.vehicleTypeId,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      totalSlots: 0,
      availableCount: 0,
      canBook: false,
      blockedByReservation: 0,
      blockedByActiveSession: 0,
    };
  }

  const result = await findSlotsAvailableForWindow({
    floorId: data.floorId,
    vehicleTypeId: data.vehicleTypeId,
    zoneId: data.zoneId,
    startTime,
    endTime,
  });

  return {
    floorId: data.floorId,
    vehicleTypeId: data.vehicleTypeId,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    totalSlots: result.totalSlots,
    availableCount: result.availableCount,
    canBook: result.availableCount > 0,
    blockedByReservation: result.blockedByReservation,
    blockedByActiveSession: result.blockedByActiveSession,
  };
};

/**
 * Gợi ý chỗ đỗ tốt nhất cho khung giờ — preview, KHÔNG tạo reservation, KHÔNG ghi ai_log.
 * Bản cơ bản: chấm điểm theo khoảng cách/cổng (slotScoring). Phần insights/ưu tiên chỗ
 * quen theo lịch sử user sẽ bổ sung ở Module 2c (prediction.service).
 */
export const previewSuggestSlot = async (data) => {
  const { startTime, endTime } = resolveBookingWindow(data);

  if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
    throw new AppError('Invalid start or end time', 400, 'VALIDATION_ERROR');
  }
  if (endTime <= startTime) {
    throw new AppError('endTime must be after startTime', 400, 'VALIDATION_ERROR');
  }

  const floor = await Floor.findByPk(data.floorId);
  if (!floor) throw new AppError('Floor not found', 404, 'NOT_FOUND');

  const vehicleType = await VehicleType.findByPk(data.vehicleTypeId);
  if (!vehicleType) throw new AppError('Vehicle type not found', 404, 'NOT_FOUND');

  const topN = Math.min(Number(data.topN) || 5, 10);
  const userPrefs = data.userId ? await getUserParkingPreferences(data.userId) : null;

  const [suggestResult, insights] = await Promise.all([
    suggestSlot({
      floorId: data.floorId,
      vehicleTypeId: data.vehicleTypeId,
      zoneId: data.zoneId,
      startTime,
      endTime,
      topN,
      userPrefs,
    }),
    getParkingInsights({
      floorId: data.floorId,
      vehicleTypeId: data.vehicleTypeId,
      userId: data.userId,
      startTime,
      endTime,
    }),
  ]);

  const { slot, meta } = suggestResult;

  const distanceToGate =
    slot.distance_to_gate != null ? Number(slot.distance_to_gate) : null;
  const distanceToElevator =
    slot.distance_to_elevator != null ? Number(slot.distance_to_elevator) : null;
  const topPick = meta.topCandidates?.[0];

  return {
    slot: {
      slotId: slot.slot_id,
      slotCode: slot.slot_code,
      zoneCode: slot.zone?.zone_code ?? null,
      floorCode: slot.zone?.floor?.floor_code ?? floor.floor_code,
    },
    reason: buildScoreReason(topPick?.breakdown, {
      distanceToGate,
      distanceToElevator,
    }),
    algorithm: meta.algorithm,
    score: meta.score,
    distanceToGate,
    distanceToElevator,
    candidatesCount: meta.candidatesCount,
    topCandidates: (meta.topCandidates || []).map((c) => ({
      ...c,
      reason: buildScoreReason(c.breakdown, {
        distanceToGate: c.distanceToGate,
        distanceToElevator: c.distanceToElevator,
      }),
    })),
    insights,
  };
};

const findActiveSessionByPlate = async (plateNumber) =>
  ParkingSession.findOne({
    where: { plate_number: normalizePlate(plateNumber), status: 'active' },
  });

export const createReservation = async (userId, data) => {
  const plateNumber = normalizePlate(data.plateNumber);
  const { startTime, endTime, shiftId } = resolveBookingWindow(data);

  if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
    throw new AppError('Invalid start or end time', 400, 'VALIDATION_ERROR');
  }
  if (endTime <= startTime) {
    throw new AppError('endTime must be after startTime', 400, 'VALIDATION_ERROR');
  }
  if (startTime < new Date()) {
    throw new AppError('startTime must be in the future', 400, 'VALIDATION_ERROR');
  }

  const floor = await Floor.findByPk(data.floorId);
  if (!floor) throw new AppError('Floor not found', 404, 'NOT_FOUND');

  const vehicleType = await VehicleType.findByPk(data.vehicleTypeId);
  if (!vehicleType) throw new AppError('Vehicle type not found', 404, 'NOT_FOUND');

  const activeSession = await findActiveSessionByPlate(plateNumber);
  if (activeSession) {
    throw new AppError('Vehicle already has an active parking session', 409, 'CONFLICT');
  }

  const overlapping = await Reservation.findOne({
    where: {
      plate_number: plateNumber,
      status: { [Op.in]: ['pending', 'confirmed', 'checked_in'] },
      start_time: { [Op.lt]: endTime },
      end_time: { [Op.gt]: startTime },
    },
  });
  if (overlapping) {
    throw new AppError('Vehicle already has an overlapping reservation', 409, 'CONFLICT');
  }

  const { slot: suggestedSlot, meta: suggestMeta } = await suggestSlot({
    floorId: data.floorId,
    vehicleTypeId: data.vehicleTypeId,
    zoneId: data.zoneId,
    startTime,
    endTime,
  });

  const bookingFee = getBookingFee();

  const reservation = await sequelize.transaction(async (transaction) => {
    await lockSlotReserved(suggestedSlot.slot_id, transaction);
    return Reservation.create(
      {
        user_id: userId,
        vehicle_type_id: data.vehicleTypeId,
        floor_id: data.floorId,
        zone_id: suggestedSlot.zone_id,
        slot_id: suggestedSlot.slot_id,
        plate_number: plateNumber,
        start_time: startTime,
        end_time: endTime,
        status: 'pending',
        // Lưu mã ca vào reservation_type để hiển thị (vd 'morning'/'overnight'); fallback 'standard'
        reservation_type: shiftId || data.reservationType || 'standard',
      },
      { transaction }
    );
  });

  await logSuggestion({
    ...suggestMeta,
    context: 'reservation',
  });

  const orderCode = generateOrderCode();
  const payosResult = await createPayOSPaymentLink({
    orderCode,
    amount: bookingFee,
    description: `Booking ${plateNumber}`,
    returnUrl: `${process.env.CLIENT_URL}/reservations`,
    cancelUrl: `${process.env.CLIENT_URL}/reservations`,
  });

  const payment = await Payment.create({
    reservation_id: reservation.reservation_id,
    order_code: orderCode,
    amount: bookingFee,
    status: 'pending',
    method: 'payos',
    gateway_transaction_id: payosResult.paymentLinkId ? String(payosResult.paymentLinkId) : null,
    gateway_response: JSON.stringify(payosResult),
  });

  const full = await getReservation(reservation.reservation_id);
  return {
    reservation: full,
    payment,
    bookingFee,
    checkoutUrl: payosResult.checkoutUrl,
  };
};

/**
 * Gọi NGƯỢC từ payment.service khi tiền về: chuyển pending -> confirmed + sinh QR.
 * Phụ thuộc một chiều: reservation chỉ nhận `payment`, không tự gọi payment.service.
 */
export const confirmReservationAfterPayment = async (payment) => {
  if (payment.status === 'success') {
    const reservation = await getReservation(payment.reservation_id);
    return { reservation, payment, confirmed: true, alreadyProcessed: true };
  }

  const reservation = await Reservation.findByPk(payment.reservation_id);
  if (!reservation) throw new AppError('Reservation not found', 404, 'NOT_FOUND');
  if (reservation.status === 'cancelled') {
    // Tiền về SAU khi đặt chỗ đã hủy → ghi nhận hoàn (thủ công), không hồi sinh đặt chỗ
    if (payment.status !== 'refunded') {
      let meta = {};
      try {
        meta = payment.gateway_response ? JSON.parse(payment.gateway_response) : {};
      } catch {
        meta = {};
      }
      await payment.update({
        status: 'refunded',
        gateway_response: JSON.stringify({
          ...meta,
          refund: {
            amount: Number(payment.amount),
            reason: 'paid_after_cancel',
            at: new Date().toISOString(),
            processedManually: true,
          },
        }),
      });
      await logAdminAction(reservation.user_id, 'RESERVATION_REFUND_OWED', {
        reservationId: reservation.reservation_id,
        amount: Number(payment.amount),
        note: 'Thanh toán về sau khi đặt chỗ đã hủy — cần hoàn thủ công',
      });
    }
    return {
      reservation: await getReservation(reservation.reservation_id),
      payment: await payment.reload(),
      confirmed: false,
      refunded: true,
    };
  }
  if (reservation.status !== 'pending') {
    throw new AppError(`Reservation is not pending (current: ${reservation.status})`, 409, 'CONFLICT');
  }

  const qrToken = generateQrToken();
  const paidAt = new Date();

  await sequelize.transaction(async (transaction) => {
    assertReservationTransition(reservation.status, 'confirmed');
    await reservation.update(
      { status: 'confirmed', qr_token: qrToken },
      { transaction }
    );
    await payment.update({ status: 'success', paid_at: paidAt }, { transaction });
  });

  return {
    reservation: await getReservation(reservation.reservation_id),
    payment: await payment.reload(),
    confirmed: true,
  };
};

/**
 * Gọi NGƯỢC từ payment.service khi thanh toán thất bại/hết hạn:
 * hủy đặt chỗ pending/confirmed + nhả slot đã giữ. Phụ thuộc một chiều.
 */
export const cancelReservationOnPaymentFail = async (reservationId, payload) => {
  const reservation = await Reservation.findByPk(reservationId);
  if (!reservation) return null;
  if (!['pending', 'confirmed'].includes(reservation.status)) return reservation;

  await sequelize.transaction(async (transaction) => {
    if (reservation.status === 'pending') {
      await releaseReservedSlot(reservation.slot_id, transaction);
    }
    await reservation.update({ status: 'cancelled' }, { transaction });
  });

  if (payload) {
    const failedPayment = await Payment.findOne({
      where: { reservation_id: reservationId, status: 'failed' },
    });
    if (failedPayment) {
      await failedPayment.update({ gateway_response: JSON.stringify(payload) });
    }
  }

  return getReservation(reservationId);
};

/** User tự hủy đặt chỗ của mình (pending/confirmed) + chính sách hoàn phí theo cutoff. */
export const cancelUserReservation = async (userId, reservationId) => {
  const reservation = await Reservation.findByPk(reservationId);
  if (!reservation) throw new AppError('Reservation not found', 404, 'NOT_FOUND');
  if (reservation.user_id !== userId) {
    throw new AppError('Not your reservation', 403, 'FORBIDDEN');
  }
  if (reservation.status === 'checked_in') {
    throw new AppError(
      'Xe đã vào bãi — không thể hủy. Ra cổng hoặc liên hệ nhân viên.',
      409,
      'CONFLICT',
    );
  }
  if (!['pending', 'confirmed'].includes(reservation.status)) {
    throw new AppError(
      'Chỉ hủy được đặt chỗ pending hoặc confirmed (DV-09)',
      409,
      'CONFLICT',
    );
  }

  // Chính sách hoàn phí booking theo thời gian: hủy confirmed trước giờ vào >= cutoff → được hoàn
  const wasConfirmed = reservation.status === 'confirmed';
  const cutoffHours = getBookingRefundCutoffHours();
  const msUntilStart = new Date(reservation.start_time).getTime() - Date.now();
  const beforeCutoff = msUntilStart >= cutoffHours * 60 * 60 * 1000;
  let refund = { applicable: wasConfirmed, eligible: false, amount: 0, cutoffHours };

  await sequelize.transaction(async (transaction) => {
    assertReservationTransition(reservation.status, 'cancelled');

    const { voidActiveSession } = await import('./session.service.js');
    const sessionsToVoid = await ParkingSession.findAll({
      where: {
        status: 'active',
        [Op.or]: [
          { reservation_id: reservationId },
          {
            plate_number: reservation.plate_number,
            reservation_id: null,
            session_type: { [Op.in]: ['walk_in', 'reservation'] },
          },
        ],
      },
      transaction,
    });

    for (const session of sessionsToVoid) {
      await voidActiveSession(session, transaction);
    }

    const slot = await ParkingSlot.findByPk(reservation.slot_id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (slot?.status === 'reserved') {
      await releaseReservedSlot(reservation.slot_id, transaction);
    } else if (slot?.status === 'occupied') {
      await releaseSlot(reservation.slot_id, transaction);
    }

    // OR-16: vô hiệu hóa QR khi hủy
    await reservation.update(
      {
        status: 'cancelled',
        qr_token: buildRevokedQrToken('reservation', reservation.reservation_id),
      },
      { transaction },
    );

    const payment = await Payment.findOne({
      where: {
        reservation_id: reservationId,
        status: { [Op.in]: ['pending', 'success'] },
      },
      transaction,
    });
    if (payment) {
      if (payment.status === 'pending') {
        // Chưa trả tiền → hủy link, không có gì để hoàn
        await payment.update({ status: 'failed' }, { transaction });
      } else if (payment.status === 'success') {
        if (beforeCutoff) {
          let meta = {};
          try {
            meta = payment.gateway_response ? JSON.parse(payment.gateway_response) : {};
          } catch {
            meta = {};
          }
          await payment.update(
            {
              status: 'refunded',
              gateway_response: JSON.stringify({
                ...meta,
                refund: {
                  amount: Number(payment.amount),
                  reason: 'user_cancel_before_cutoff',
                  cutoffHours,
                  at: new Date().toISOString(),
                  processedManually: true,
                },
              }),
            },
            { transaction },
          );
          refund = { applicable: true, eligible: true, amount: Number(payment.amount), cutoffHours };
        } else {
          // Hủy sát giờ → mất phí giữ chỗ (payment giữ nguyên 'success')
          refund = {
            applicable: true,
            eligible: false,
            amount: 0,
            cutoffHours,
            forfeitedAmount: Number(payment.amount),
          };
        }
      }
    }
  });

  if (refund.eligible) {
    await logAdminAction(userId, 'RESERVATION_REFUND_OWED', {
      reservationId,
      amount: refund.amount,
      note: 'Hoàn phí booking khi hủy trước cutoff — PayOS cần chuyển khoản hoàn thủ công',
    });
  }

  const result = (await getReservation(reservationId)).toJSON();
  result.refund = refund;
  return result;
};

/** @deprecated alias */
export const cancelPendingReservation = cancelUserReservation;

/** Staff — booking đã thanh toán, chờ check-in (chưa vào bãi) */
export const listStaffUpcomingReservations = async () => {
  const now = new Date();
  return Reservation.findAll({
    where: {
      status: 'confirmed',
      end_time: { [Op.gte]: now },
    },
    include: reservationIncludes,
    order: [['start_time', 'ASC']],
    limit: 100,
  });
};

/** Staff — tra cứu đặt chỗ từ mã QR (preview trước check-in) */
export const staffLookupReservationByQr = async (qrToken) => {
  const token = String(qrToken || '').trim();
  if (!token || token.startsWith('revoked-')) {
    throw new AppError('Mã QR không hợp lệ hoặc đã vô hiệu', 400, 'VALIDATION_ERROR');
  }
  const reservation = await Reservation.findOne({
    where: { qr_token: token },
    include: reservationIncludes,
  });
  if (!reservation) {
    throw new AppError('Không tìm thấy đặt chỗ với mã QR này', 404, 'NOT_FOUND');
  }
  return reservation;
};

/** Staff cho xe vào bãi: kiểm confirmed + đúng cổng/tầng/khung giờ → tạo session active. */
export const checkinReservation = async (staffUserId, data) => {
  let reservation;

  if (data.reservationId) {
    reservation = await Reservation.findByPk(data.reservationId);
  } else if (data.qrToken) {
    reservation = await Reservation.findOne({ where: { qr_token: data.qrToken } });
  } else {
    throw new AppError('Provide reservationId or qrToken', 400, 'VALIDATION_ERROR');
  }

  if (!reservation) throw new AppError('Reservation not found', 404, 'NOT_FOUND');
  if (reservation.status === 'cancelled') {
    throw new AppError('Đặt chỗ đã bị hủy', 409, 'CONFLICT');
  }
  if (reservation.status !== 'confirmed') {
    throw new AppError(`Reservation must be confirmed (current: ${reservation.status})`, 409, 'CONFLICT');
  }

  const gate = await Gate.findByPk(data.gateId);
  if (!gate || !gate.is_active) {
    throw new AppError('Gate not found or inactive', 404, 'NOT_FOUND');
  }
  if (gate.direction !== 'in') {
    throw new AppError('Check-in must use an IN gate', 400, 'VALIDATION_ERROR');
  }
  assertGateVehicleType(gate, reservation.vehicle_type_id);
  if (gate.floor_id !== reservation.floor_id) {
    await recordWrongFloorIncident({
      gateFloorId: gate.floor_id,
      expectedFloorId: reservation.floor_id,
      reservationId: reservation.reservation_id,
      userId: reservation.user_id,
      slotId: reservation.slot_id,
    });
    throw new AppError('Wrong floor — QR floor does not match gate floor', 403, 'FORBIDDEN');
  }

  const now = new Date();
  // Không chặn theo giờ mở cửa tòa (DV-14) cho đặt chỗ: khung CA đã đặt (kể cả ca
  // qua đêm 22:00→06:00) chính là sự cho phép vào. Giới hạn entry do cửa sổ start/end bên dưới.

  const graceMs = CHECKIN_EARLY_GRACE_MS;
  if (now.getTime() < reservation.start_time.getTime() - graceMs) {
    await recordIncident({
      type: 'window_violation',
      description: `Check-in too early for reservation ${reservation.reservation_id}`,
      reservationId: reservation.reservation_id,
      userId: reservation.user_id,
      slotId: reservation.slot_id,
    });
    throw new AppError('Quá sớm — ngoài khung giờ đặt chỗ (sớm tối đa 15 phút)', 409, 'CONFLICT');
  }
  if (now > reservation.end_time) {
    await recordIncident({
      type: 'window_violation',
      description: `Check-in too late for reservation ${reservation.reservation_id}`,
      reservationId: reservation.reservation_id,
      userId: reservation.user_id,
      slotId: reservation.slot_id,
    });
    throw new AppError('Too late — reservation window ended', 409, 'CONFLICT');
  }

  const activeSession = await findActiveSessionByPlate(reservation.plate_number);

  const sessionQrToken = generateQrToken();
  const timeIn = new Date();

  const session = await sequelize.transaction(async (transaction) => {
    if (activeSession) {
      const locked = await ParkingSession.findByPk(activeSession.session_id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (
        locked?.status === 'active' &&
        locked.session_type === 'walk_in' &&
        !locked.reservation_id
      ) {
        const { voidActiveSession } = await import('./session.service.js');
        await voidActiveSession(locked, transaction);
      } else if (locked?.status === 'active') {
        await recordIncident({
          type: 'duplicate_session',
          description: `Plate ${reservation.plate_number} already has active session ${locked.session_id}`,
          reservationId: reservation.reservation_id,
          userId: reservation.user_id,
          sessionId: locked.session_id,
        });
        throw new AppError('Vehicle already has an active session', 409, 'CONFLICT');
      }
    }

    await occupyReservedSlot(reservation.slot_id, transaction);

    const created = await ParkingSession.create(
      {
        user_id: reservation.user_id,
        reservation_id: reservation.reservation_id,
        gate_id: data.gateId,
        slot_id: reservation.slot_id,
        vehicle_type_id: reservation.vehicle_type_id,
        plate_number: reservation.plate_number,
        time_in: timeIn,
        qr_token: sessionQrToken,
        check_in_by: staffUserId,
        session_type: 'reservation',
        status: 'active',
      },
      { transaction }
    );

    assertReservationTransition(reservation.status, 'checked_in');
    await reservation.update({ status: 'checked_in' }, { transaction });
    return created;
  });

  return {
    session: await getSession(session.session_id),
    reservation: await getReservation(reservation.reservation_id),
  };
};

/**
 * Gọi NGƯỢC từ payment.service khi session hoàn tất (xe ra + đã thanh toán):
 * chuyển reservation checked_in -> completed. Phụ thuộc một chiều.
 */
export const markReservationCompleted = async (reservationId, transaction) => {
  const reservation = await Reservation.findByPk(reservationId, { transaction });
  if (reservation && reservation.status === 'checked_in') {
    assertReservationTransition(reservation.status, 'completed');
    await reservation.update({ status: 'completed' }, { transaction });
  }
};
