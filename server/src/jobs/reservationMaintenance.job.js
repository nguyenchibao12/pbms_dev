import { Op } from 'sequelize';
import sequelize from '../config/db.js';
import { Reservation, ParkingSlot } from '../models/index.js';
import {
  cancelReservationOnPaymentFail,
  markReservationNoShow,
} from '../services/reservation.service.js';
import { syncSlotLockFlag, SLOT_LOCK_LEAD_MS } from '../utils/slotSuggest.js';
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
 * Ca C — KHÓA TRỄ (JIT, luật 1): cờ 'reserved' chỉ bật trước giờ vào SLOT_LOCK_LEAD_MS.
 * Quét 2 chiều mỗi tick: (1) đơn sắp bắt đầu trong lead mà slot chưa khóa → kích;
 * (2) slot đang 'reserved' → sync lại, hết đơn trong cửa sổ thì tự nhả (dọn cả cờ mồ côi
 * do seed/chỉnh tay). syncSlotLockFlag idempotent nên chạy trùng nhịp với webhook/hủy an toàn.
 */
const syncSlotLocks = async () => {
  const now = Date.now();
  const [upcoming, flagged] = await Promise.all([
    Reservation.findAll({
      where: {
        status: { [Op.in]: ['pending', 'confirmed'] },
        start_time: { [Op.lte]: new Date(now + SLOT_LOCK_LEAD_MS) },
        end_time: { [Op.gt]: new Date(now) },
      },
      attributes: ['slot_id'],
    }),
    ParkingSlot.findAll({ where: { status: 'reserved' }, attributes: ['slot_id'] }),
  ]);

  const slotIds = new Set([
    ...upcoming.map((r) => r.slot_id).filter(Boolean),
    ...flagged.map((s) => s.slot_id),
  ]);

  let synced = 0;
  for (const slotId of slotIds) {
    try {
      await sequelize.transaction((transaction) => syncSlotLockFlag(slotId, transaction));
      synced += 1;
    } catch (err) {
      console.error(`[reservation-maintenance] sync slot lock #${slotId} failed:`, err.message);
    }
  }
  return synced;
};

/** Một lượt quét: gọi được trực tiếp trong test. */
export const runReservationMaintenance = async () => {
  const expired = await expireStalePending();
  const noShow = await markNoShows();
  const synced = await syncSlotLocks();
  if (expired || noShow) {
    console.log(
      `[reservation-maintenance] expired ${expired} pending, marked ${noShow} no-show`,
    );
  }
  return { expired, noShow, synced };
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
