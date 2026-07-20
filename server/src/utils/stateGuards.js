import { AppError } from './helpers.js';

// Ân hạn VÀO SỚM trước start_time. Chủ module chốt BỎ (=0): check-in mở đúng từ start_time —
// khớp đúng lúc job khóa-đầu-ca giữ slot, cửa sổ vào khít [start_time, end_time]. LƯU Ý: SRS
// BR-31 quy định 15' → đây là LỆCH SRS có chủ đích (cần cập nhật tài liệu). Giữ hằng làm nguồn
// duy nhất (cả reservation.service lẫn session.service cùng đọc) để dễ đảo lại nếu cần.
export const CHECKIN_EARLY_GRACE_MS = 0;

/** DV-08 */
const SLOT_TRANSITIONS = {
  available: ['reserved', 'occupied', 'maintenance', 'locked'],
  reserved: ['occupied', 'available'],
  occupied: ['available'],
  maintenance: ['available'],
  locked: ['available'],
};

export const assertSlotTransition = (fromStatus, toStatus) => {
  if (fromStatus === toStatus) return;
  const allowed = SLOT_TRANSITIONS[fromStatus];
  if (!allowed?.includes(toStatus)) {
    throw new AppError(
      `Chuyển trạng thái slot không hợp lệ: ${fromStatus} → ${toStatus} (DV-08)`,
      409,
      'INVALID_STATE',
    );
  }
};

/** DV-09 */
const RESERVATION_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['checked_in', 'cancelled', 'no_show'],
  checked_in: ['completed'],
};

export const assertReservationTransition = (fromStatus, toStatus) => {
  if (fromStatus === toStatus) return;
  const allowed = RESERVATION_TRANSITIONS[fromStatus];
  if (!allowed?.includes(toStatus)) {
    throw new AppError(
      `Chuyển trạng thái đặt chỗ không hợp lệ: ${fromStatus} → ${toStatus} (DV-09)`,
      409,
      'INVALID_STATE',
    );
  }
};

/** DV-10 */
export const assertSessionActive = (session) => {
  if (!session || session.status !== 'active') {
    throw new AppError(
      `Phiên không ở trạng thái active (DV-10)`,
      409,
      'INVALID_STATE',
    );
  }
};

export const assertSessionCheckoutTime = (timeIn, timeOut) => {
  if (!timeOut || !timeIn || new Date(timeOut) <= new Date(timeIn)) {
    throw new AppError('time_out phải sau time_in (DV-04)', 400, 'VALIDATION_ERROR');
  }
};

/** DV-05 / OR-16 — token vô hiệu sau check-out */
export const buildRevokedQrToken = (entity, id) =>
  `revoked-${entity}-${id}-${Date.now()}`;

/**
 * OR-16 — QR đặt chỗ hết hiệu lực theo TRẠNG THÁI, không bằng cách bẻ token
 * (token gốc được giữ lại để user/staff còn tra cứu lịch sử, giống vé tháng hết hạn).
 * 'checked_in' PHẢI còn hiệu lực: xe đang trong bãi vẫn quét chính mã này ở cổng
 * tầng và cổng ra — chặn ở đây sẽ nhốt xe lại trong bãi.
 */
const RESERVATION_QR_DEAD_STATUSES = ['cancelled', 'no_show', 'completed'];

export const assertReservationQrUsable = (reservation) => {
  if (RESERVATION_QR_DEAD_STATUSES.includes(reservation.status)) {
    throw new AppError(
      `Đặt chỗ không còn hiệu lực (trạng thái: ${reservation.status})`,
      409,
      'CONFLICT',
    );
  }
};
