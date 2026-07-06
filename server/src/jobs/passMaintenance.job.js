import { Op } from 'sequelize';
import { MonthlyPass } from '../models/index.js';
import { cancelPassOnPaymentFail } from '../services/monthlyPass.service.js';
import { getBookingPendingTtlMinutes } from '../utils/settings.js';

// Job nền dọn vé tháng (bắt chước reservationMaintenance.job.js):
// - Ca A: vé `pending` quá TTL chưa thanh toán -> `cancelled` (nhả suất capacity —
//   countPassCapacityUsage đếm cả pending nên vé bỏ quên chiếm suất vĩnh viễn).
//   TTL tái dùng booking_pending_ttl_minutes: cùng bản chất "thời gian chờ trả PayOS".
// - Ca B: vé `active` quá end_date -> `expired` (query runtime tự lọc theo ngày nên
//   nghiệp vụ không sai, nhưng status phải đúng để FE hiển thị badge + report chính xác).
// Chạy mỗi phút bằng setInterval (không cần thư viện cron), idempotent theo status.

const INTERVAL_MS = 60 * 1000;
let timer = null;

/** Ca A: pending quá TTL từ lúc tạo mà chưa trả tiền -> hủy (tái dùng guard status trong service). */
const expireStalePendingPasses = async () => {
  const ttlMinutes = getBookingPendingTtlMinutes();
  const ttlCutoff = new Date(Date.now() - ttlMinutes * 60 * 1000);
  const stale = await MonthlyPass.findAll({
    where: { status: 'pending', created_at: { [Op.lt]: ttlCutoff } },
    attributes: ['pass_id'],
  });

  let count = 0;
  for (const row of stale) {
    try {
      await cancelPassOnPaymentFail(row.pass_id);
      count += 1;
    } catch (err) {
      console.error(`[pass-maintenance] expire pending #${row.pass_id} failed:`, err.message);
    }
  }
  return count;
};

/** Ca B: active quá end_date -> expired. Update có điều kiện WHERE status nên idempotent + chống race. */
const expireEndedActivePasses = async () => {
  const today = new Date().toISOString().slice(0, 10);
  const [count] = await MonthlyPass.update(
    { status: 'expired' },
    { where: { status: 'active', end_date: { [Op.lt]: today } } },
  );
  return count;
};

/** Một lượt quét: gọi được trực tiếp trong test. */
export const runPassMaintenance = async () => {
  const cancelled = await expireStalePendingPasses();
  const expired = await expireEndedActivePasses();
  if (cancelled || expired) {
    console.log(`[pass-maintenance] cancelled ${cancelled} pending, expired ${expired} active`);
  }
  return { cancelled, expired };
};

/** Bật job: quét 1 lần ngay khi boot rồi lặp mỗi phút. */
export const startPassMaintenanceJob = () => {
  if (timer) return timer;
  const tick = () =>
    runPassMaintenance().catch((err) =>
      console.error('[pass-maintenance] tick failed:', err.message),
    );
  tick();
  timer = setInterval(tick, INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
  return timer;
};

export const stopPassMaintenanceJob = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};
