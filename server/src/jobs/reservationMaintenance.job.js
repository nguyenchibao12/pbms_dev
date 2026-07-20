import { Op } from 'sequelize';
import { Reservation } from '../models/index.js';
import {
  cancelReservationOnPaymentFail,
  markReservationNoShow,
  materializeReservationSlot,
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

/** Ca A: pending quá TTL chưa thanh toán HOẶC đã quá khung giờ (end_time) -> hủy + nhả slot. */
const expireStalePending = async () => {
  const ttlMinutes = getBookingPendingTtlMinutes();
  const ttlCutoff = new Date(Date.now() - ttlMinutes * 60 * 1000);
  const now = new Date();
  const stale = await Reservation.findAll({
    where: {
      status: 'pending',
      [Op.or]: [
        { created_at: { [Op.lt]: ttlCutoff } }, // quá TTL từ lúc tạo mà chưa trả tiền
        { end_time: { [Op.lt]: now } },          // khung giờ đã kết thúc → pending vô nghĩa, nhả ngay
      ],
    },
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

/**
 * Ca C — KHÓA-ĐẦU-CA (materialize): đơn confirmed đã tới ca (start<=now<end) mà chưa có slot →
 * giữ 1 slot 'reserved' trên tầng đặt (dù khách chưa tới). materializeReservationSlot tự guard
 * status + row-lock nên idempotent, chạy trùng nhịp check-in/hủy an toàn. Tầng hết chỗ → hàm tự
 * ghi incident (staff dọn sớm), check-in sau vẫn có bậc chuyển-tầng.
 */
const lockSlotsForStartedShifts = async () => {
  const now = new Date();
  const due = await Reservation.findAll({
    where: {
      status: 'confirmed',
      slot_id: null,
      start_time: { [Op.lte]: now },
      end_time: { [Op.gt]: now },
    },
    attributes: ['reservation_id'],
  });

  let locked = 0;
  for (const row of due) {
    try {
      const res = await materializeReservationSlot(row.reservation_id);
      if (res.locked) locked += 1;
    } catch (err) {
      console.error(
        `[reservation-maintenance] lock slot #${row.reservation_id} failed:`,
        err.message,
      );
    }
  }
  return locked;
};

/**
 * Một lượt quét: gọi được trực tiếp trong test. Ca A/B đổi status là tự trả suất sức chứa;
 * Ca C giữ 1 slot 'reserved' cho đơn vừa tới ca (materialize) — cặp với các đường nhả ở service.
 */
export const runReservationMaintenance = async () => {
  const expired = await expireStalePending();
  const noShow = await markNoShows();
  const locked = await lockSlotsForStartedShifts();
  if (expired || noShow || locked) {
    console.log(
      `[reservation-maintenance] expired ${expired} pending, marked ${noShow} no-show, locked ${locked} slot`,
    );
  }
  return { expired, noShow, locked };
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
