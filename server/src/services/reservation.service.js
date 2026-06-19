import { Op } from 'sequelize';
import sequelize from '../config/db.js';
import {
  Reservation,
  Payment,
  ParkingSession,
  Floor,
  VehicleType,
} from '../models/index.js';
import { AppError } from '../utils/helpers.js';
import { generateQrToken } from '../utils/qr.js';
import { suggestSlot, lockSlotReserved } from '../utils/slotSuggest.js';
import { createPayOSPaymentLink, generateOrderCode } from './payos.client.js';
import { logSuggestion } from './aiLog.service.js';
import { validateAndNormalizePlateVN } from '../utils/plateVN.js';
import { assertReservationTransition } from '../utils/stateGuards.js';
import { resolveShiftWindow } from '../utils/shifts.js';
import { getBookingFee as getBookingFeeFromSettings } from '../utils/settings.js';
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
