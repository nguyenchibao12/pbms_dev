import { Op } from 'sequelize';
import sequelize from '../config/db.js';
import {
  Reservation,
  Payment,
  ParkingSession,
  ParkingSlot,
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
} from '../utils/slotSuggest.js';
import { createPayOSPaymentLink, generateOrderCode } from './payos.client.js';
import { logSuggestion } from './aiLog.service.js';
import { validateAndNormalizePlateVN } from '../utils/plateVN.js';
import { assertReservationTransition, buildRevokedQrToken } from '../utils/stateGuards.js';
import { resolveShiftWindow } from '../utils/shifts.js';
import {
  getBookingFee as getBookingFeeFromSettings,
  getBookingRefundCutoffHours,
} from '../utils/settings.js';
import { logAdminAction } from '../utils/auditLog.js';

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
