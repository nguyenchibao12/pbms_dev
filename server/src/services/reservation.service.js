import { Op } from 'sequelize';
import sequelize from '../config/db.js';
import {
  Reservation,
  Payment,
  ParkingSession,
  ParkingSlot,
  Zone,
  Gate,
  Floor,
  VehicleType,
  RefundRequest,
} from '../models/index.js';
import { AppError } from '../utils/helpers.js';
import { generateQrToken } from '../utils/qr.js';
import {
  suggestSlot,
  occupySlotForReservation,
  reserveSlotForReservation,
  releaseReservedSlot,
} from '../utils/slotSuggest.js';
import {
  getReservationWindowCapacity,
} from '../utils/reservationCapacity.js';
import { resolveZoneIds, NO_SLOT_FOR_WINDOW_MESSAGE } from '../utils/slotWindow.js';
import { buildScoreReason } from '../utils/slotScoring.js';
import {
  createPayOSPaymentLink,
  generateOrderCode,
  getPayOSPaymentInfo,
  cancelPayOSPaymentLink,
} from './payos.client.js';
import { logSuggestion } from './aiLog.service.js';
import { getParkingInsights, getUserParkingPreferences } from './prediction.service.js';
import { getSession } from './session.service.js';
import { recordWrongFloorIncident, recordIncident } from './incident.service.js';
import { validateAndNormalizePlateVN } from '../utils/plateVN.js';
import { assertGateVehicleType } from '../utils/gateVehicle.js';
import { resolveFloorGate } from '../utils/gateResolve.js';
import { assertReservationTransition, assertReservationQrUsable } from '../utils/stateGuards.js';
import { resolveShiftWindow } from '../utils/shifts.js';
import {
  getBookingFee as getBookingFeeFromSettings,
  getBookingRefundCutoffHours,
  getBookingRefundPercent,
  getBookingMaxAdvanceDays,
  getBookingMaxDurationHours,
  getPassRefundPolicy,
} from '../utils/settings.js';
import { logAdminAction } from '../utils/auditLog.js';

// Ân hạn VÀO SỚM đã BỎ (=0): check-in mở đúng từ start_time (khớp lúc job khóa-đầu-ca giữ slot).
// SRS BR-31 để 15' — LỆCH SRS có chủ đích, cần cập nhật tài liệu.
const CHECKIN_EARLY_GRACE_MS = 0;
// Phiên walk-in trẻ hơn ngưỡng này được void khi check-in đơn đặt (staff vừa nhập nhầm);
// già hơn thì bắt checkout thu phí trước — void là mất trắng tiền gửi của cả quãng đã đỗ.
const WALKIN_VOID_ON_CHECKIN_MAX_AGE_MS = 15 * 60 * 1000;
// 3.4 — số ứng viên slot tối đa thử khoá khi gặp race (giới hạn row-lock giữ trong 1 transaction)
const MAX_SLOT_LOCK_ATTEMPTS = 5;

const reservationIncludes = [
  { association: 'slot', include: [{ association: 'zone', include: [{ association: 'floor' }] }] },
  // floor/zone top-level TRÙNG với slot.zone.floor nhưng CỐ Ý giữ cả hai: trang user đọc
  // r.floor/r.zone, trang staff đọc slot.zone.floor — bỏ bên nào cũng vỡ FE.
  { association: 'floor' },
  { association: 'zone' },
  { association: 'vehicleType' },
  { association: 'user', attributes: ['user_id', 'full_name', 'username', 'email'] },
  // KHÔNG trả gateway_response/gateway_transaction_id: đó là JSON PayOS nội bộ (số tài khoản
  // nhận tiền của merchant, checkoutUrl cũ…) — user không cần và không nên thấy.
  {
    association: 'payments',
    attributes: ['payment_id', 'order_code', 'amount', 'status', 'method', 'paid_at', 'created_at'],
  },
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

/**
 * Kiểm tra khung giờ đặt chỗ hợp lệ.
 * Với CA cố định: cho phép đặt CA ĐANG DIỄN RA (hiện tại) — chỉ chặn ca đã kết thúc,
 * vì start của ca hiện tại luôn ở quá khứ (vd 14h chọn ca chiều 12–18h).
 * Với start/end tự do: vẫn yêu cầu start ở tương lai.
 */
const assertBookableWindow = (startTime, endTime, shiftId) => {
  if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
    throw new AppError('Invalid start or end time', 400, 'VALIDATION_ERROR');
  }
  if (endTime <= startTime) {
    throw new AppError('endTime must be after startTime', 400, 'VALIDATION_ERROR');
  }
  const now = new Date();
  if (shiftId) {
    if (endTime <= now) {
      throw new AppError('Ca đã kết thúc, vui lòng chọn ca khác', 400, 'VALIDATION_ERROR');
    }
  } else if (startTime < now) {
    throw new AppError('startTime must be in the future', 400, 'VALIDATION_ERROR');
  }
  // R1 — trần cửa sổ đặt chỗ (Settings Nhóm C): slot bị giam `reserved` ngay từ lúc tạo đơn,
  // không trần thì một đơn 20k giam slot vật lý nhiều tuần. Dùng `>` để đơn chạm trần đúng
  // 24h tròn vẫn QUA. Đặt theo CA (shiftId) cũng đi qua đây nên trần tự áp.
  const maxAdvanceDays = getBookingMaxAdvanceDays();
  if (startTime.getTime() - now.getTime() > maxAdvanceDays * 24 * 60 * 60 * 1000) {
    throw new AppError(`Chỉ được đặt trước tối đa ${maxAdvanceDays} ngày`, 400, 'VALIDATION_ERROR');
  }
  const maxDurationHours = getBookingMaxDurationHours();
  if (endTime.getTime() - startTime.getTime() > maxDurationHours * 60 * 60 * 1000) {
    throw new AppError(`Mỗi đơn đặt chỗ tối đa ${maxDurationHours} giờ`, 400, 'VALIDATION_ERROR');
  }
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
  const { startTime, endTime, shiftId } = resolveBookingWindow(data);

  assertBookableWindow(startTime, endTime, shiftId);

  const floor = await Floor.findByPk(data.floorId);
  if (!floor) throw new AppError('Floor not found', 404, 'NOT_FOUND');

  const vehicleType = await VehicleType.findByPk(data.vehicleTypeId);
  if (!vehicleType) throw new AppError('Vehicle type not found', 404, 'NOT_FOUND');

  // zoneId (nếu gửi) chỉ được VALIDATE thuộc tầng+loại xe — sức chứa luôn tính TOÀN TẦNG
  // (mô hình suất, migration 008): đơn không-zone gán vào bất kỳ zone nào lúc check-in,
  // nên đếm hẹp theo zone là oversell.
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

  const cap = await getReservationWindowCapacity({
    floorId: data.floorId,
    vehicleTypeId: data.vehicleTypeId,
    startTime,
    endTime,
  });

  return {
    floorId: data.floorId,
    vehicleTypeId: data.vehicleTypeId,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    totalSlots: cap.totalSlots,
    availableCount: cap.available,
    canBook: cap.available > 0,
    blockedByReservation: cap.booked,
    blockedByActiveSession: cap.occupiedNow,
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
    }),
    algorithm: meta.algorithm,
    score: meta.score,
    distanceToGate,
    candidatesCount: meta.candidatesCount,
    topCandidates: (meta.topCandidates || []).map((c) => ({
      ...c,
      reason: buildScoreReason(c.breakdown, {
        distanceToGate: c.distanceToGate,
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

  assertBookableWindow(startTime, endTime, shiftId);

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

  // MÔ HÌNH SỨC CHỨA (migration 008): KHÔNG chọn/ghim slot lúc đặt — chỉ kiểm còn SUẤT
  // trong khung giờ. zoneId (nếu gửi) là ƯU TIÊN gán chỗ lúc check-in, phải thuộc tầng+loại xe.
  if (data.zoneId) {
    const zoneIds = await resolveZoneIds({
      floorId: data.floorId,
      vehicleTypeId: data.vehicleTypeId,
      zoneId: data.zoneId,
    });
    if (zoneIds.length === 0) {
      throw new AppError(
        'Không có khu đỗ cho tầng và loại xe này. Vui lòng chọn loại xe hoặc tầng khác.',
        404,
        'NOT_FOUND',
      );
    }
  }

  const bookingFee = getBookingFee();

  const reservation = await sequelize.transaction(async (transaction) => {
    // Khóa TRỌN bộ zone của (tầng, loại xe) FOR UPDATE làm CÂU LỆNH ĐẦU TIÊN — serialize
    // các booking cùng tầng (và cả mua vé tháng, vốn khóa cùng bộ row qua getPassCapacity)
    // y hệt khuôn purchaseMonthlyPass. Đếm sức chứa xong mới tạo đơn.
    const cap = await getReservationWindowCapacity({
      floorId: data.floorId,
      vehicleTypeId: data.vehicleTypeId,
      startTime,
      endTime,
      transaction,
      lockZones: true,
    });
    if (cap.available <= 0) {
      throw new AppError(NO_SLOT_FOR_WINDOW_MESSAGE, 409, 'NO_SLOT_FOR_WINDOW');
    }

    // Re-check trùng biển TRONG transaction: pre-check ở trên chạy ngoài txn nên 2 request
    // cùng biển bắn đồng thời đều lọt. Cùng tầng thì zone-lock đã serialize nên bắt chắc;
    // khác tầng vẫn là best-effort như trước (khóa zone rời nhau).
    const overlappingRecheck = await Reservation.findOne({
      where: {
        plate_number: plateNumber,
        status: { [Op.in]: ['pending', 'confirmed', 'checked_in'] },
        start_time: { [Op.lt]: endTime },
        end_time: { [Op.gt]: startTime },
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (overlappingRecheck) {
      throw new AppError('Vehicle already has an overlapping reservation', 409, 'CONFLICT');
    }

    return Reservation.create(
      {
        user_id: userId,
        vehicle_type_id: data.vehicleTypeId,
        floor_id: data.floorId,
        zone_id: data.zoneId ?? null,
        slot_id: null,
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

  // 3.2 — reservation `pending` đã COMMIT (đang chiếm 1 suất sức chứa). Nếu tạo link PayOS
  // hoặc ghi Payment lỗi mà không bù trừ, suất sẽ kẹt tới khi job TTL quét. Bọc saga:
  // hỏng -> hủy reservation (cancelReservationOnPaymentFail). Job nền 3.3 là lớp dự phòng.
  let payosResult;
  let payment;
  try {
    const orderCode = generateOrderCode();
    payosResult = await createPayOSPaymentLink({
      orderCode,
      amount: bookingFee,
      description: `Booking ${plateNumber}`,
      returnUrl: `${process.env.CLIENT_URL}/reservations`,
      cancelUrl: `${process.env.CLIENT_URL}/reservations`,
    });

    payment = await Payment.create({
      reservation_id: reservation.reservation_id,
      order_code: orderCode,
      amount: bookingFee,
      status: 'pending',
      method: 'payos',
      gateway_transaction_id: payosResult.paymentLinkId ? String(payosResult.paymentLinkId) : null,
      gateway_response: JSON.stringify(payosResult),
    });
  } catch (err) {
    await cancelReservationOnPaymentFail(reservation.reservation_id).catch((cleanupErr) =>
      console.error(
        `[createReservation] bù trừ thất bại cho #${reservation.reservation_id} (job 3.3 sẽ dọn):`,
        cleanupErr.message,
      ),
    );
    console.error('[createReservation] tạo thanh toán PayOS lỗi:', err.message);
    throw new AppError(
      'Không tạo được liên kết thanh toán, đã hủy giữ chỗ — vui lòng thử lại',
      502,
      'PAYMENT_GATEWAY_ERROR',
    );
  }

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
    // Tiền về SAU khi đặt chỗ đã hủy → không hồi sinh đặt chỗ. Payment giữ 'success'
    // (tiền ĐÃ về thật) + tạo RefundRequest 100% cho trang hoàn tiền của Admin —
    // completeRefund mới là lúc payment đổi sang 'refunded' (đồng bộ với monthly pass).
    // Idempotent: webhook/verify có thể gọi lặp → đã có refund_request cho payment này thì bỏ qua.
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
            reservation_id: reservation.reservation_id,
            payment_id: payment.payment_id,
            user_id: reservation.user_id,
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
      await logAdminAction(reservation.user_id, 'RESERVATION_REFUND_OWED', {
        reservationId: reservation.reservation_id,
        amount: Number(payment.amount),
        note: 'Thanh toán về sau khi đặt chỗ đã hủy — đã tạo yêu cầu hoàn tiền',
      });
    }
    return {
      reservation: await getReservation(reservation.reservation_id),
      payment: await payment.reload(),
      confirmed: false,
      refunded: true,
      refundRequested: !existingRefund,
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

  // Mô hình suất: đổi status là tự trả suất. Nếu đơn ĐÃ khóa-đầu-ca (giữ slot 'reserved') thì
  // nhả slot vật lý đó về 'available'.
  if (reservation.slot_id) {
    await sequelize.transaction((transaction) => releaseReservedSlot(reservation.slot_id, transaction));
  }
  await reservation.update({ status: 'cancelled', slot_id: null });

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

/**
 * Job nền (3.3): đặt chỗ confirmed đã quá khung giờ mà không check-in -> no_show + nhả slot.
 * KHÔNG hoàn phí booking (no-show = mất phí giữ chỗ). Vô hiệu QR. Guard theo status để
 * idempotent (chạy trùng nhịp với webhook/checkin cũng không hỏng).
 */
export const markReservationNoShow = async (reservationId) => {
  const reservation = await Reservation.findByPk(reservationId);
  if (!reservation) return null;
  if (reservation.status !== 'confirmed') return reservation;

  await sequelize.transaction(async (transaction) => {
    const locked = await Reservation.findByPk(reservationId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    // Có thể đã đổi trạng thái (check-in/hủy) giữa lúc đọc và khoá → bỏ qua.
    if (!locked || locked.status !== 'confirmed') return;

    assertReservationTransition(locked.status, 'no_show');
    // OR-16: giữ nguyên qr_token — cổng chặn theo status (assertReservationQrUsable).
    // Nhả slot 'reserved' nếu đơn đã khóa-đầu-ca (hết ca không tới → trả chỗ về bãi).
    if (locked.slot_id) await releaseReservedSlot(locked.slot_id, transaction);
    await locked.update({ status: 'no_show', slot_id: null }, { transaction });
  });

  return getReservation(reservationId);
};

/**
 * Chính sách hoàn phí giữ chỗ hiện hành (đọc từ settings) — cho modal hủy đặt chỗ của User hiện
 * đúng số đã cấu hình thay vì hardcode. Mirror monthlyPass.getRefundPolicy.
 *   cutoffHours: hủy trước giờ vào ≥ ngần này → được hoàn; refundPercent: % hoàn khi trong hạn đó.
 */
export const getReservationRefundPolicy = () => ({
  cutoffHours: getBookingRefundCutoffHours(),
  refundPercent: getBookingRefundPercent(),
});

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

  // Chính sách hoàn phí booking theo thời gian: hủy confirmed trước giờ vào >= cutoff → được hoàn.
  // % hoàn (booking_refund_percent) do Manager cấu hình; sát giờ (trong cutoff) luôn 0%.
  const wasConfirmed = reservation.status === 'confirmed';
  const cutoffHours = getBookingRefundCutoffHours();
  const refundPercent = getBookingRefundPercent();
  const msUntilStart = new Date(reservation.start_time).getTime() - Date.now();
  const beforeCutoff = msUntilStart >= cutoffHours * 60 * 60 * 1000;
  // reason cho FE hiển thị đúng lý do: 'not_paid' (chưa có thanh toán thành công —
  // vd đơn seed/demo hoặc chưa trả tiền) | 'late_cancel' (sát giờ / chính sách 0%) | 'refund_created'.
  let refund = { applicable: wasConfirmed, eligible: false, amount: 0, cutoffHours, refundPercent, reason: 'not_paid' };

  await sequelize.transaction(async (transaction) => {
    assertReservationTransition(reservation.status, 'cancelled');

    const { voidActiveSession } = await import('./session.service.js');
    // CHỈ void phiên thuộc CHÍNH đơn này. Trước đây match thêm mọi phiên active cùng biển số
    // (reservation_id null) — hủy một đơn TƯƠNG LAI là void luôn phiên walk-in ĐANG GỬI của
    // chính chiếc xe đó: phiên mất, xe kẹt trong bãi không checkout được.
    const sessionsToVoid = await ParkingSession.findAll({
      where: { status: 'active', reservation_id: reservationId },
      transaction,
    });

    for (const session of sessionsToVoid) {
      await voidActiveSession(session, transaction);
    }

    // OR-16: giữ nguyên qr_token — cổng chặn theo status (assertReservationQrUsable).
    // Nhả slot 'reserved' nếu đơn đã khóa-đầu-ca; phiên của CHÍNH đơn này (nếu có) đã được
    // voidActiveSession nhả slot 'occupied' ở trên.
    if (reservation.slot_id) await releaseReservedSlot(reservation.slot_id, transaction);
    await reservation.update({ status: 'cancelled', slot_id: null }, { transaction });

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
        // Tiền hoàn = phí giữ chỗ × % hoàn cấu hình (làm tròn đồng). % = 0 ⇒ không hoàn dù trước cutoff.
        const refundAmount = Math.round((Number(payment.amount) * refundPercent) / 100);
        if (beforeCutoff && refundAmount > 0) {
          // Payment GIỮ 'success' (tiền chưa hoàn thật) — tạo RefundRequest cho trang
          // hoàn tiền của Admin; completeRefund mới đổi payment sang 'refunded'
          // (dùng chung hạ tầng với monthly pass, migration 006).
          await RefundRequest.create(
            {
              reservation_id: reservationId,
              payment_id: payment.payment_id,
              user_id: reservation.user_id,
              percent: refundPercent,
              amount: refundAmount,
              status: 'pending',
              requested_at: new Date(),
            },
            { transaction },
          );
          const { bankInfoTtlDays } = getPassRefundPolicy();
          refund = {
            applicable: true,
            eligible: true,
            amount: refundAmount,
            percent: refundPercent,
            cutoffHours,
            bankInfoTtlDays,
            reason: 'refund_created',
            instructions:
              `Bạn được hoàn ${refundAmount.toLocaleString('vi-VN')}đ — vui lòng cập nhật ` +
              `tài khoản ngân hàng trong hồ sơ trong vòng ${bankInfoTtlDays} ngày để nhận tiền.`,
          };
        } else {
          // Hủy sát giờ (trong cutoff) HOẶC chính sách hoàn 0% → mất phí giữ chỗ (payment giữ 'success')
          refund = {
            applicable: true,
            eligible: false,
            amount: 0,
            cutoffHours,
            refundPercent,
            reason: 'late_cancel',
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

/**
 * Lấy lại link thanh toán phí giữ chỗ cho đơn pending (khách tắt tab PayOS giữa chừng).
 * Đối xứng với repayMonthlyPass: link cũ còn PENDING trên PayOS → trả lại (không đẻ giao dịch
 * thừa); link đã chết (khách bấm hủy trên PayOS → orderCode CANCELLED) → đánh dấu payment cũ
 * 'failed' rồi sinh orderCode + link + Payment pending MỚI.
 */
export const repayReservation = async (userId, reservationId) => {
  const reservation = await Reservation.findByPk(reservationId);
  if (!reservation) throw new AppError('Reservation not found', 404, 'NOT_FOUND');
  if (reservation.user_id !== userId) throw new AppError('Not your reservation', 403, 'FORBIDDEN');
  if (reservation.status !== 'pending') {
    throw new AppError(
      `Đơn không ở trạng thái chờ thanh toán (hiện tại: ${reservation.status})`,
      409,
      'CONFLICT',
    );
  }
  // Đơn quá giờ vào bãi thì trả tiền cũng vô nghĩa — chặn sớm thay vì thu tiền rồi mới báo hỏng.
  if (new Date(reservation.end_time) <= new Date()) {
    throw new AppError('Khung giờ đặt đã kết thúc — vui lòng đặt chỗ mới', 409, 'CONFLICT');
  }

  const oldPayment = await Payment.findOne({
    where: { reservation_id: reservation.reservation_id, status: 'pending' },
    order: [['created_at', 'DESC']],
  });

  if (oldPayment) {
    let info = null;
    try {
      info = await getPayOSPaymentInfo(oldPayment.order_code);
    } catch {
      info = null; // không tra được (mạng/PayOS lỗi) — xử lý thận trọng bên dưới
    }

    // Link cũ còn sống → trả lại chính nó, không đẻ giao dịch thừa.
    // (Không trả field `payment` riêng — reservation.payments đã chứa đúng row đó, trả thêm
    // là lặp dữ liệu; FE chỉ dùng checkoutUrl/reused/alreadyPaid.)
    if (info?.status === 'PENDING') {
      const stored = JSON.parse(oldPayment.gateway_response || '{}');
      if (stored.checkoutUrl) {
        return {
          reservation: await getReservation(reservation.reservation_id),
          checkoutUrl: stored.checkoutUrl,
          reused: true,
        };
      }
    }

    // Tiền ĐÃ về nhưng webhook chưa tới (localhost không có webhook) → xác nhận đơn luôn,
    // tuyệt đối không phát link mới: phát nữa là khách trả tiền lần hai cho cùng chỗ đỗ.
    if (info?.status === 'PAID') {
      await confirmReservationAfterPayment(oldPayment);
      return {
        reservation: await getReservation(reservation.reservation_id),
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
        // Hủy lỗi: có thể do đơn đã chết sẵn (PayOS ném lỗi) — nhưng cũng có thể do mạng.
        // Hỏi lại; còn PENDING hoặc vẫn không tra được thì DỪNG, không phát link thứ hai.
        const recheck = await getPayOSPaymentInfo(oldPayment.order_code).catch(() => null);
        if (!recheck || recheck.status === 'PENDING') {
          console.error('[repayReservation] không hủy được link cũ:', err.message);
          throw new AppError(
            'Chưa hủy được liên kết thanh toán cũ — vui lòng thử lại sau giây lát',
            502,
            'PAYMENT_GATEWAY_ERROR',
          );
        }
      }
    }
    await oldPayment.update({ status: 'failed' });
  }

  // Giữ đúng giá lúc đặt (snapshot trên payment cũ); đơn chưa từng có payment → giá hiện hành.
  const amount = oldPayment ? Number(oldPayment.amount) : getBookingFee();
  try {
    const orderCode = generateOrderCode();
    const payosResult = await createPayOSPaymentLink({
      orderCode,
      amount,
      description: `Booking ${reservation.plate_number}`,
      returnUrl: `${process.env.CLIENT_URL}/reservations`,
      cancelUrl: `${process.env.CLIENT_URL}/reservations`,
    });
    await Payment.create({
      reservation_id: reservation.reservation_id,
      order_code: orderCode,
      amount,
      status: 'pending',
      method: 'payos',
      gateway_transaction_id: payosResult.paymentLinkId ? String(payosResult.paymentLinkId) : null,
      gateway_response: JSON.stringify(payosResult),
    });
    return {
      reservation: await getReservation(reservation.reservation_id),
      checkoutUrl: payosResult.checkoutUrl,
      reused: false,
    };
  } catch (err) {
    // KHÔNG hủy đơn ở đây (khác lúc đặt): khách còn bấm "Trả tiếp" lại được;
    // đơn pending bỏ quên quá TTL đã có job nền dọn.
    console.error('[repayReservation] tạo thanh toán PayOS lỗi:', err.message);
    throw new AppError('Không tạo được liên kết thanh toán — vui lòng thử lại', 502, 'PAYMENT_GATEWAY_ERROR');
  }
};

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
  // Token bị bẻ từ trước OR-16 (dữ liệu cũ) — không còn tra ngược được về đơn nào.
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
  assertReservationQrUsable(reservation);
  return reservation;
};

/** Gợi ý slot trong khung [now, end] trên MỘT tầng — ưu tiên khu, hết thì cả tầng. Trả null
 *  nếu tầng hết chỗ (NO_SLOT_FOR_WINDOW/NOT_FOUND/CONFLICT), ném lỗi khác lên trên. */
const trySuggestOnFloor = async ({ floorId, vehicleTypeId, zoneId, endTime }) => {
  const windowArgs = { floorId, vehicleTypeId, startTime: new Date(), endTime };
  if (zoneId) {
    try {
      return await suggestSlot({ ...windowArgs, zoneId });
    } catch (err) {
      if (!['NO_SLOT_FOR_WINDOW', 'NOT_FOUND', 'CONFLICT'].includes(err.code)) throw err;
      // khu ưu tiên hết → thử cả tầng bên dưới
    }
  }
  try {
    return await suggestSlot(windowArgs);
  } catch (err) {
    if (['NO_SLOT_FOR_WINDOW', 'NOT_FOUND', 'CONFLICT'].includes(err.code)) return null;
    throw err;
  }
};

/** Chốt 1 slot từ danh sách gợi ý (row-lock) — thua race (SLOT_BUSY) thì thử ứng viên kế. */
const occupyFromSuggestion = async (suggestion, transaction) => {
  const candidates = (suggestion.rankedSlots?.length ? suggestion.rankedSlots : [suggestion.slot])
    .slice(0, MAX_SLOT_LOCK_ATTEMPTS);
  for (const candidate of candidates) {
    try {
      await occupySlotForReservation(candidate.slot_id, transaction);
      return candidate;
    } catch (err) {
      if (err.code === 'SLOT_BUSY') continue;
      throw err;
    }
  }
  return null;
};

/** Các tầng KHÁC (cùng loại xe) để "walk the guest" khi tầng đặt hết — dùng cho bậc 3. */
const findFallbackFloorIds = async (excludeFloorId, vehicleTypeId) => {
  const zones = await Zone.findAll({
    where: { vehicle_type_id: vehicleTypeId, floor_id: { [Op.ne]: excludeFloorId } },
    attributes: ['floor_id'],
  });
  return [...new Set(zones.map((z) => z.floor_id))];
};

/** Staff cho xe vào bãi: kiểm confirmed + đúng cổng/tầng/khung giờ → tạo session active. */
/**
 * BẬC THANG GÁN CHỖ lúc check-in (guarantee = "có chỗ trong TÒA", tầng chỉ là ưu tiên):
 *   B1: slot ĐÃ KHÓA SẴN đầu ca (reservation.slot_id, status 'reserved') → chiếm thẳng nó.
 *   B2: tầng đặt còn trống → gán slot tốt nhất (ưu tiên khu → cả tầng).
 *   B3: tầng đặt HẾT (do overstay) → "walk the guest" sang tầng khác cùng loại xe + cờ floorChanged.
 *   B4: cả tòa hết → ném NO_SLOT_RESCUE (caller xử: hủy + hoàn phí + incident).
 * Danh sách ứng viên đọc NGOÀI txn, chốt bằng occupySlotForReservation (row-lock) TRONG txn.
 */
const assignSlotForCheckin = async (reservation, transaction) => {
  // B1: slot đã giữ sẵn cho chính đơn này (job khóa-đầu-ca).
  if (reservation.slot_id) {
    try {
      const slot = await occupySlotForReservation(reservation.slot_id, transaction);
      return {
        slot,
        meta: { algorithm: 'pre-locked', selectedSlotId: slot.slot_id, floorId: reservation.floor_id, vehicleTypeId: reservation.vehicle_type_id },
        floorChanged: false,
      };
    } catch (err) {
      if (err.code !== 'SLOT_BUSY') throw err; // slot đã mất (bị chiếm khác) → gán lại bên dưới
    }
  }

  // B2: tầng đặt.
  const onFloor = await trySuggestOnFloor({
    floorId: reservation.floor_id,
    vehicleTypeId: reservation.vehicle_type_id,
    zoneId: reservation.zone_id,
    endTime: reservation.end_time,
  });
  if (onFloor) {
    const slot = await occupyFromSuggestion(onFloor, transaction);
    if (slot) return { slot, meta: onFloor.meta, floorChanged: false };
  }

  // B3: tầng đặt hết → tầng khác cùng loại xe.
  const fallbackFloorIds = await findFallbackFloorIds(reservation.floor_id, reservation.vehicle_type_id);
  for (const fid of fallbackFloorIds) {
    const other = await trySuggestOnFloor({
      floorId: fid,
      vehicleTypeId: reservation.vehicle_type_id,
      zoneId: null,
      endTime: reservation.end_time,
    });
    if (!other) continue;
    const slot = await occupyFromSuggestion(other, transaction);
    if (slot) {
      return {
        slot,
        meta: other.meta,
        floorChanged: true,
        fromFloorId: reservation.floor_id,
        toFloorId: fid,
      };
    }
  }

  // B4: cả tòa hết.
  throw new AppError(
    'Không còn chỗ trống trong toàn bãi cho khung giờ này — nhờ nhân viên xử lý.',
    409,
    'NO_SLOT_RESCUE',
  );
};

/**
 * KHÓA-ĐẦU-CA (materialize): đơn confirmed đã tới ca (start<=now<end) mà chưa có slot → giữ 1
 * slot 'reserved' trên tầng đặt (ưu tiên khu → cả tầng), kể cả khách chưa tới. Tầng hết chỗ →
 * ghi incident (staff dọn sớm), để slot_id null cho check-in tự xử (bậc 3 chuyển tầng).
 * Idempotent: đã có slot_id / khác 'confirmed' / ngoài ca → bỏ qua. Job nền gọi mỗi phút.
 */
export const materializeReservationSlot = async (reservationId) => {
  const reservation = await Reservation.findByPk(reservationId);
  if (!reservation || reservation.status !== 'confirmed' || reservation.slot_id) {
    return { locked: false };
  }
  const now = Date.now();
  if (
    new Date(reservation.start_time).getTime() > now ||
    new Date(reservation.end_time).getTime() <= now
  ) {
    return { locked: false };
  }

  const suggestion = await trySuggestOnFloor({
    floorId: reservation.floor_id,
    vehicleTypeId: reservation.vehicle_type_id,
    zoneId: reservation.zone_id,
    endTime: reservation.end_time,
  });
  if (!suggestion) {
    await recordIncident({
      type: 'slot_conflict',
      status: 'open',
      reservationId,
      userId: reservation.user_id,
      description:
        `Đầu ca không còn chỗ trên tầng để giữ cho đơn ${reservation.plate_number} ` +
        `(khung ${new Date(reservation.start_time).toLocaleString('vi-VN')}) — chờ check-in xử (có thể chuyển tầng).`,
    });
    return { locked: false };
  }

  const candidates = (suggestion.rankedSlots?.length ? suggestion.rankedSlots : [suggestion.slot])
    .slice(0, MAX_SLOT_LOCK_ATTEMPTS);
  let lockedSlot = null;
  await sequelize.transaction(async (transaction) => {
    const r = await Reservation.findByPk(reservationId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!r || r.status !== 'confirmed' || r.slot_id) return; // đổi trạng thái/đã materialize giữa chừng
    for (const cand of candidates) {
      try {
        const slot = await reserveSlotForReservation(cand.slot_id, transaction);
        await r.update({ slot_id: slot.slot_id, zone_id: slot.zone_id }, { transaction });
        lockedSlot = slot;
        return;
      } catch (err) {
        if (err.code === 'SLOT_BUSY') continue; // ứng viên vừa bị giật → thử kế
        throw err;
      }
    }
  });

  return lockedSlot ? { locked: true, slotId: lockedSlot.slot_id } : { locked: false };
};

/**
 * B4 — cả tòa hết chỗ khi đơn đặt tới check-in (bất khả kháng, thường do xe ở lì/overstay): hủy đơn
 * + tự tạo yêu cầu hoàn 100% phí giữ chỗ (đấu vào luồng refund sẵn có — completeRefund của Admin
 * mới đổi payment sang 'refunded', KHÔNG gọi PayOS thật ở đây) + ghi incident cho staff.
 * Idempotent qua row-lock + guard status; nhả slot 'reserved' nếu đơn lỡ có giữ sẵn.
 */
const handleBuildingOverflow = async (reservation, staffUserId) => {
  await sequelize.transaction(async (transaction) => {
    const locked = await Reservation.findByPk(reservation.reservation_id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!locked || locked.status !== 'confirmed') return;
    if (locked.slot_id) await releaseReservedSlot(locked.slot_id, transaction);
    assertReservationTransition(locked.status, 'cancelled');
    await locked.update({ status: 'cancelled', slot_id: null }, { transaction });

    const payment = await Payment.findOne({
      where: { reservation_id: locked.reservation_id, status: 'success' },
      transaction,
    });
    if (payment) {
      const existing = await RefundRequest.findOne({
        where: { payment_id: payment.payment_id },
        transaction,
      });
      if (!existing) {
        await RefundRequest.create(
          {
            reservation_id: locked.reservation_id,
            payment_id: payment.payment_id,
            user_id: locked.user_id,
            percent: 100,
            amount: Number(payment.amount),
            status: 'pending',
            requested_at: new Date(),
          },
          { transaction },
        );
      }
    }
  });

  await recordIncident({
    type: 'slot_conflict',
    status: 'open',
    reservationId: reservation.reservation_id,
    userId: reservation.user_id,
    reportedBy: staffUserId,
    description:
      `HẾT CHỖ TOÀN BÃI khi check-in đơn ${reservation.plate_number} ` +
      `(khung ${new Date(reservation.start_time).toLocaleString('vi-VN')}) — đã hủy đơn + tạo hoàn 100% phí giữ chỗ.`,
  });
};

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

  let gate;
  if (data.gateId) {
    // Cổng được chỉ định: validate + ghi incident nếu sai tầng (giữ nguyên hành vi cũ).
    gate = await Gate.findByPk(data.gateId);
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
  } else {
    // Không gửi gateId: tự suy cổng vào của đúng tầng đã đặt.
    gate = await resolveFloorGate({
      floorId: reservation.floor_id,
      direction: 'in',
      vehicleTypeId: reservation.vehicle_type_id,
    });
  }

  const now = new Date();
  // Không chặn theo giờ mở cửa tòa (DV-14) cho đặt chỗ: khung CA đã đặt (kể cả ca
  // qua đêm 22:00→06:00) chính là sự cho phép vào. Giới hạn entry do cửa sổ start/end bên dưới.

  // Ân hạn vào sớm đã bỏ (CHECKIN_EARLY_GRACE_MS = 0) → chặn mọi lượt vào trước start_time.
  const graceMs = CHECKIN_EARLY_GRACE_MS;
  if (now.getTime() < reservation.start_time.getTime() - graceMs) {
    await recordIncident({
      type: 'window_violation',
      description: `Check-in too early for reservation ${reservation.reservation_id}`,
      reservationId: reservation.reservation_id,
      userId: reservation.user_id,
      slotId: reservation.slot_id,
    });
    throw new AppError('Chưa tới giờ ca đã đặt — vui lòng quay lại đúng giờ vào', 409, 'CONFLICT');
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

  let assignInfo = null;
  let session;
  try {
    session = await sequelize.transaction(async (transaction) => {
    if (activeSession) {
      const locked = await ParkingSession.findByPk(activeSession.session_id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      // Chỉ void phiên walk-in MỚI TOANH (≤15') — case staff lỡ nhập walk-in rồi mới thấy
      // xe có đặt chỗ. Phiên đã đỗ lâu mà void là XÓA SỔ phí gửi xe của cả quãng đó (khách
      // gửi walk-in từ sáng, tới giờ đơn quét QR đặt chỗ → sáng thành miễn phí). Phiên cũ
      // phải checkout thu tiền trước rồi mới check-in đơn.
      const walkInAgeMs = locked?.time_in
        ? timeIn.getTime() - new Date(locked.time_in).getTime()
        : Number.POSITIVE_INFINITY;
      if (
        locked?.status === 'active' &&
        locked.session_type === 'walk_in' &&
        !locked.reservation_id &&
        walkInAgeMs <= WALKIN_VOID_ON_CHECKIN_MAX_AGE_MS
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

    // MÔ HÌNH SUẤT: đơn không ghim chỗ — gán slot thật TẠI ĐÂY (như vé tháng), ưu tiên
    // khu user chọn lúc đặt. Đơn di sản còn slot_id cũ cũng đi chung đường (gán mới —
    // pin cũ không còn được enforce ở đâu).
    assignInfo = await assignSlotForCheckin(reservation, transaction);
    const slotUpdate = { slot_id: assignInfo.slot.slot_id, zone_id: assignInfo.slot.zone_id };
    // B3 "walk the guest": tầng đặt hết → chuyển floor_id sang tầng mới cho đơn/hiển thị nhất
    // quán (session ghi slot tầng mới; lần quét cổng tầng sau khớp theo floor này, không báo sai tầng).
    if (assignInfo.floorChanged) slotUpdate.floor_id = assignInfo.toFloorId;
    await reservation.update(slotUpdate, { transaction });

    const created = await ParkingSession.create(
      {
        user_id: reservation.user_id,
        reservation_id: reservation.reservation_id,
        gate_id: gate.gate_id,
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
  } catch (err) {
    // B4: cả tòa hết chỗ → hủy đơn + tự hoàn 100% phí + incident, rồi báo 409 cho staff/kiosk.
    if (err.code === 'NO_SLOT_RESCUE') {
      await handleBuildingOverflow(reservation, staffUserId);
      throw new AppError(
        'Hết chỗ toàn bãi cho khung giờ này — đã hoàn 100% phí giữ chỗ, mời quý khách quay lại sau.',
        409,
        'BUILDING_FULL_REFUNDED',
      );
    }
    throw err;
  }

  // ai_log dời từ lúc ĐẶT sang lúc CHECK-IN (UC-25): giờ mới là lúc hệ thật sự chọn chỗ.
  if (assignInfo?.meta) {
    await logSuggestion({
      ...assignInfo.meta,
      selectedSlotId: assignInfo.slot.slot_id,
      sessionId: session.session_id,
      context: 'reservation',
    });
  }

  // B3: đã "walk the guest" sang tầng khác — ghi vết cho staff + trả cờ để FE báo khách.
  if (assignInfo?.floorChanged) {
    await recordIncident({
      type: 'slot_conflict',
      status: 'open',
      reservationId: reservation.reservation_id,
      userId: reservation.user_id,
      reportedBy: staffUserId,
      slotId: assignInfo.slot.slot_id,
      description:
        `Tầng đặt (#${assignInfo.fromFloorId}) hết chỗ khi check-in đơn ${reservation.plate_number} ` +
        `— đã chuyển sang tầng #${assignInfo.toFloorId}, chỗ ${assignInfo.slot.slot_code}.`,
    });
  }

  return {
    session: await getSession(session.session_id),
    reservation: await getReservation(reservation.reservation_id),
    // Giữ field cho FE cũ: gán-lúc-check-in là hành vi mặc định, không còn khái niệm "đổi chỗ".
    slotReassigned: false,
    // B3: FE báo khách "chỗ của bạn chuyển sang tầng khác" khi floorReassigned = true.
    floorReassigned: Boolean(assignInfo?.floorChanged),
    reassignedTo: assignInfo?.floorChanged
      ? { floorId: assignInfo.toFloorId, slotCode: assignInfo.slot.slot_code }
      : null,
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
