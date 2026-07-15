// Verify — checkinWithPass chặn tạo phiên thứ 2 khi biển của vé ĐÃ có phiên đang gửi
// (vd walk-in tạo ở booth). Đây là guard chống trùng phiên/race quét-2-lần. Dựng cảnh bằng
// create thẳng model (1 zone + slot + session active + pass cùng biển). Tự dọn.
// Chạy: node scripts/testPassCheckinRaceGuard.js
import 'dotenv/config';
import sequelize from '../src/config/db.js';
import { Zone, ParkingSlot, ParkingSession, MonthlyPass, Gate } from '../src/models/index.js';
import { checkinWithPass } from '../src/services/monthlyPass.service.js';

let pass = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  PASS: ${name}`); }
  else { fail += 1; console.log(`  FAIL: ${name} ${extra}`); }
};
const grab = async (fn) => {
  try { return { ok: true, value: await fn() }; }
  catch (err) { return { ok: false, code: err.errorCode || err.code, status: err.statusCode, message: err.message }; }
};

const uniq = Date.now().toString().slice(-6);
const PLATE = '51H-99999';
const cleanup = { sessions: [], slots: [], zones: [], passes: [] };

const run = async () => {
  const zone = await Zone.create({
    floor_id: 1, vehicle_type_id: 1,
    zone_code: `RCZ${uniq}`, label: 'Race zone', total_slots: 10, monthly_pass_capacity: 0,
  });
  cleanup.zones.push(zone.zone_id);

  const slot = await ParkingSlot.create({
    zone_id: zone.zone_id, slot_code: `RCZ${uniq}-01`, status: 'occupied',
  });
  cleanup.slots.push(slot.slot_id);

  // Phiên walk-in đang gửi cho đúng biển của vé (gate_id NOT NULL → mượn 1 cổng có sẵn).
  const anyGate = await Gate.findOne();
  if (!anyGate) throw new Error('Seed chưa có cổng nào — cần npm run seed trước');
  const session = await ParkingSession.create({
    user_id: 4, gate_id: anyGate.gate_id, slot_id: slot.slot_id, vehicle_type_id: 1, plate_number: PLATE,
    time_in: new Date(), qr_token: `race-${uniq}`, check_in_by: 4,
    session_type: 'walk_in', status: 'active', calculated_fee: null,
  });
  cleanup.sessions.push(session.session_id);

  const today = new Date();
  const end = new Date(today.getTime() + 30 * 86400000);
  const passRow = await MonthlyPass.create({
    user_id: 4, vehicle_type_id: 1, floor_id: 1, plate_number: PLATE,
    valid_from_time: '00:00:00', valid_to_time: '23:59:59',
    start_date: today.toISOString().slice(0, 10), end_date: end.toISOString().slice(0, 10),
    status: 'active',
  });
  cleanup.passes.push(passRow.pass_id);

  console.log('=== Biển của vé đã có phiên active → checkinWithPass phải chặn ALREADY_PARKED ===');
  const before = await ParkingSession.count({ where: { plate_number: PLATE, status: 'active' } });
  const r = await grab(() => checkinWithPass(passRow, { gateId: null }));
  check('409 ALREADY_PARKED', r.ok === false && r.status === 409 && r.code === 'ALREADY_PARKED', JSON.stringify(r));
  const after = await ParkingSession.count({ where: { plate_number: PLATE, status: 'active' } });
  check('KHÔNG tạo thêm phiên (vẫn 1)', after === before && after === 1, `(before ${before}, after ${after})`);

  // Dọn thêm mọi phiên phát sinh cho biển (đề phòng test tạo nhầm).
  const extra = await ParkingSession.findAll({ where: { plate_number: PLATE } });
  extra.forEach((s) => cleanup.sessions.push(s.session_id));
};

try {
  await run();
} catch (err) {
  fail += 1;
  console.log('LỖI NGOÀI DỰ KIẾN:', err.stack || err.message);
} finally {
  for (const id of [...new Set(cleanup.sessions)]) await ParkingSession.destroy({ where: { session_id: id } });
  for (const id of [...new Set(cleanup.slots)]) await ParkingSlot.destroy({ where: { slot_id: id } });
  for (const id of cleanup.passes) await MonthlyPass.destroy({ where: { pass_id: id } });
  for (const id of cleanup.zones) await Zone.destroy({ where: { zone_id: id } });
  console.log(`\n=== KẾT QUẢ: ${pass} PASS / ${fail} FAIL ===`);
  console.log('LƯU Ý: chống race quét-2-lần THẬT (khoá row vé + re-check trong transaction) khó test');
  console.log('  tất định — ở đây kiểm guard pre-check; phần lock đối xứng với purchaseMonthlyPass.');
  await sequelize.close();
  process.exit(fail ? 1 : 0);
}
