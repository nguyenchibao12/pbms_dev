import { Op } from 'sequelize';
import { Reservation } from '../models/index.js';
import {
  cancelReservationOnPaymentFail,
  markReservationNoShow,
} from '../services/reservation.service.js';
import {
  getBookingPendingTtlMinutes,
  getBookingNoShowGraceMinutes,
} from '../utils/settings.js';

// Job nền xử lý điểm yếu 3.3: đơn pending/no-show giữ slot vô hạn.
// Chạy mỗi phút bằng setInterval (không cần thư viện cron). Mọi thao tác nhả slot
// được TÁI DÙNG từ reservation.service (cancelReservationOnPaymentFail / markReservationNoShow),
// các hàm đó tự khoá hàng + guard theo status nên an toàn khi chạy trùng nhịp với webhook.

const INTERVAL_MS = 60 * 1000;
let timer = null;

/** Ca A: pending quá hạn chưa thanh toán -> hủy + nhả slot. */
const expireStalePending = async () => {
  const ttlMinutes = getBookingPendingTtlMinutes();
  const cutoff = new Date(Date.now() - ttlMinutes * 60 * 1000);
  const stale = await Reservation.findAll({
    where: { status: 'pending', created_at: { [Op.lt]: cutoff } },
    attributes: ['reservation_id'],
  });

  let count = 0;
  for (const row of stale) {
    try {
      await cancelReservationOnPaymentFail(row.reservation_id);
      count += 1;
    } catch (err) {
      console.error(
        `[reservation-maintenance] expire pending #${row.reservation_id} failed:`,
        err.message,
      );
    }
  }
  return count;
};

/** Ca B: confirmed quá khung giờ + grace mà không check-in -> no_show + nhả slot. */
const markNoShows = async () => {
  const graceMinutes = getBookingNoShowGraceMinutes();
  const cutoff = new Date(Date.now() - graceMinutes * 60 * 1000);
  const overdue = await Reservation.findAll({
    where: { status: 'confirmed', end_time: { [Op.lt]: cutoff } },
    attributes: ['reservation_id'],
  });

  let count = 0;
  for (const row of overdue) {
    try {
      await markReservationNoShow(row.reservation_id);
      count += 1;
    } catch (err) {
      console.error(
        `[reservation-maintenance] no-show #${row.reservation_id} failed:`,
        err.message,
      );
    }
  }
  return count;
};

/** Một lượt quét: gọi được trực tiếp trong test. */
export const runReservationMaintenance = async () => {
  const expired = await expireStalePending();
  const noShow = await markNoShows();
  if (expired || noShow) {
    console.log(
      `[reservation-maintenance] expired ${expired} pending, marked ${noShow} no-show`,
    );
  }
  return { expired, noShow };
};

/** Bật job: quét 1 lần ngay khi boot rồi lặp mỗi phút. */
export const startReservationMaintenanceJob = () => {
  if (timer) return timer;
  const tick = () =>
    runReservationMaintenance().catch((err) =>
      console.error('[reservation-maintenance] tick failed:', err.message),
    );
  tick();
  timer = setInterval(tick, INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
  return timer;
};

export const stopReservationMaintenanceJob = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};
