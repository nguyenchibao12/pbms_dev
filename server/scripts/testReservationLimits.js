// Acceptance test — R1: trần cửa sổ đặt chỗ (Settings Nhóm C, booking_max_*).
// Trước fix: đặt được năm 2030, đơn dài 100 giờ → slot bị giam `reserved` NGAY từ lúc
// tạo đơn, đơn confirmed giam thẳng tới end_time. Sau fix: đặt trước tối đa
// booking_max_advance_days (3) ngày, mỗi đơn tối đa booking_max_duration_hours (24) giờ.
// 6 kịch bản / 8 check (kịch bản 1–2 mỗi cái 2 check: status + message).
// Test qua getWindowAvailability là chính (cùng chạy assertBookableWindow, chỉ đọc —
// không tạo đơn, không đụng PayOS). Chạy: node scripts/testReservationLimits.js
import 'dotenv/config';
import { ParkingSlot } from '../src/models/index.js';
import { clearSettingsCache } from '../src/utils/settings.js';
import {
  createReservation,
  getWindowAvailability,
} from '../src/services/reservation.service.js';

// Chốt chặn kép: dù case nào lọt tới bước thanh toán cũng không tạo link tiền thật.
delete process.env.PAYOS_CLIENT_ID;
// Test số mặc định — gỡ override nếu .env có đặt. LUÔN clearSettingsCache() sau khi đổi
// env: getter chỉ đọc env tươi khi cache RỖNG; cache đã warm (server thật, hoặc test nào đó
// gọi refreshSettingsCache) là env bị đông cứng — thiếu dòng clear thì test hỏng ÂM THẦM
// tùy trạng thái cache, không phải lúc nào cũng đổ ngay.
delete process.env.BOOKING_MAX_ADVANCE_DAYS;
delete process.env.BOOKING_MAX_DURATION_HOURS;
clearSettingsCache();

const USER_ID = 4; // seed: user
const H = 3600 * 1000;
const D = 24 * H;
let pass = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  PASS: ${name}`); }
  else { fail += 1; console.log(`  FAIL: ${name} ${extra}`); }
};
const grab = async (fn) => {
  try { return { ok: true, value: await fn() }; }
  catch (err) { return { ok: false, code: err.code, status: err.statusCode, message: err.message }; }
};

const run = async () => {
  const slot = await ParkingSlot.findOne({
    where: { status: 'available' },
    include: [{ association: 'zone' }],
  });
  if (!slot) throw new Error('Hết slot available — seed lại DB');
  const base = { floorId: slot.zone.floor_id, vehicleTypeId: slot.zone.vehicle_type_id };
  const windowFrom = (start, hours) => ({
    startTime: start.toISOString(),
    endTime: new Date(start.getTime() + hours * H).toISOString(),
  });

  console.log('=== KỊCH BẢN 1: đặt trước 4 ngày (quá trần 3) → 400 ===');
  const r1 = await grab(() => getWindowAvailability({
    ...base,
    ...windowFrom(new Date(Date.now() + 4 * D), 4),
  }));
  check('bị chặn 400', r1.ok === false && r1.status === 400, JSON.stringify(r1));
  check('message nêu trần 3 ngày', String(r1.message).includes('3 ngày'), r1.message);

  console.log('=== KỊCH BẢN 2: đơn dài 25 giờ (quá trần 24) → 400 ===');
  const r2 = await grab(() => getWindowAvailability({
    ...base,
    ...windowFrom(new Date(Date.now() + 1 * D), 25),
  }));
  check('bị chặn 400', r2.ok === false && r2.status === 400, JSON.stringify(r2));
  check('message nêu trần 24 giờ', String(r2.message).includes('24 giờ'), r2.message);

  console.log('=== KỊCH BẢN 3: 2 ngày trước, dài 4h (trong trần) → OK ===');
  const r3 = await grab(() => getWindowAvailability({
    ...base,
    ...windowFrom(new Date(Date.now() + 2 * D), 4),
  }));
  check('qua validation bình thường', r3.ok === true, JSON.stringify(r3));

  console.log('=== KỊCH BẢN 4: đơn đúng 24h tròn (chạm trần, không vượt) → OK ===');
  const r4 = await grab(() => getWindowAvailability({
    ...base,
    ...windowFrom(new Date(Date.now() + 1 * D), 24),
  }));
  check('24h tròn vẫn hợp lệ', r4.ok === true, JSON.stringify(r4));

  console.log('=== KỊCH BẢN 5: env BOOKING_MAX_ADVANCE_DAYS=30 → 20 ngày OK ===');
  process.env.BOOKING_MAX_ADVANCE_DAYS = '30';
  clearSettingsCache(); // BẮT BUỘC sau khi SET env — xem ghi chú đầu file
  const r5 = await grab(() => getWindowAvailability({
    ...base,
    ...windowFrom(new Date(Date.now() + 20 * D), 4),
  }));
  check('20 ngày lọt khi trần nâng lên 30', r5.ok === true, JSON.stringify(r5));
  delete process.env.BOOKING_MAX_ADVANCE_DAYS;
  clearSettingsCache(); // và sau khi XÓA — trả mặc định cho case sau

  console.log('=== KỊCH BẢN 6: createReservation cũng bị chặn (không chỉ preview) ===');
  const r6 = await grab(() => createReservation(USER_ID, {
    ...base,
    plateNumber: '94A-80001',
    ...windowFrom(new Date(Date.now() + 4 * D), 4),
  }));
  check(
    '400 VALIDATION_ERROR trước khi đụng slot/PayOS (không phải 502 gateway)',
    r6.ok === false && r6.status === 400 && r6.code === 'VALIDATION_ERROR',
    JSON.stringify(r6),
  );

  console.log(`\n==== KẾT QUẢ: ${pass} PASS / ${fail} FAIL ====`);
  return fail === 0;
};

run()
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((err) => { console.error('Test crash:', err); process.exit(1); });
