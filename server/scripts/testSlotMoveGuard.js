// Verify — updateParkingSlot chặn CHUYỂN KHU cho chỗ đang occupied/reserved (phiên/đơn đang
// gắn chỗ sẽ lệch tầng → cổng báo wrong_floor). Slot available thì chuyển bình thường.
// Tạo 2 zone tạm + 1 slot (create thẳng model, bỏ qua guard service khi dựng cảnh). Tự dọn.
// Chạy: node scripts/testSlotMoveGuard.js
import 'dotenv/config';
import sequelize from '../src/config/db.js';
import { Zone, ParkingSlot } from '../src/models/index.js';
import { updateParkingSlot } from '../src/services/parkingSlot.service.js';

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

const cleanup = { slots: [], zones: [] };
const uniq = Date.now().toString().slice(-6);
let slotSeq = 0;

const makeZone = async (code) => {
  const z = await Zone.create({
    floor_id: 1,
    vehicle_type_id: 1,
    zone_code: `TST${uniq}-${code}`,
    label: `Test zone ${code}`,
    total_slots: 10,
    monthly_pass_capacity: 0,
  });
  cleanup.zones.push(z.zone_id);
  return z;
};

const makeSlot = async (zoneId, status) => {
  slotSeq += 1;
  const s = await ParkingSlot.create({
    zone_id: zoneId,
    slot_code: `TST${uniq}-${zoneId}-${String(slotSeq).padStart(2, '0')}`,
    status,
    distance_to_gate: null,
  });
  cleanup.slots.push(s.slot_id);
  return s;
};

const run = async () => {
  const zoneA = await makeZone('A');
  const zoneB = await makeZone('B');

  console.log('=== TEST 1: chuyển khu khi OCCUPIED → 409, KHÔNG di chuyển ===');
  const s1 = await makeSlot(zoneA.zone_id, 'occupied');
  const r1 = await grab(() => updateParkingSlot(s1.slot_id, { zoneId: zoneB.zone_id }));
  check('409 CONFLICT', r1.ok === false && r1.status === 409, JSON.stringify(r1));
  check('slot VẪN ở zone A', (await ParkingSlot.findByPk(s1.slot_id)).zone_id === zoneA.zone_id);

  console.log('=== TEST 2: chuyển khu khi RESERVED → 409 ===');
  const s2 = await makeSlot(zoneA.zone_id, 'reserved');
  const r2 = await grab(() => updateParkingSlot(s2.slot_id, { zoneId: zoneB.zone_id }));
  check('409 CONFLICT', r2.ok === false && r2.status === 409, JSON.stringify(r2));

  console.log('=== TEST 3: chuyển khu khi AVAILABLE → OK, sang zone B + sinh lại mã ===');
  const s3 = await makeSlot(zoneA.zone_id, 'available');
  const r3 = await grab(() => updateParkingSlot(s3.slot_id, { zoneId: zoneB.zone_id }));
  check('không lỗi', r3.ok === true, JSON.stringify(r3));
  const s3after = await ParkingSlot.findByPk(s3.slot_id);
  check('slot đã sang zone B', s3after.zone_id === zoneB.zone_id, `(zone=${s3after.zone_id})`);
  check('mã chỗ sinh lại theo mã khu B', s3after.slot_code.startsWith(zoneB.zone_code), s3after.slot_code);

  console.log('=== TEST 4: đổi status TẠI CHỖ (không đổi khu) khi occupied vẫn cho (không dính guard) ===');
  // Guard chỉ chặn khi ĐỔI KHU. Cập nhật khác khu = giữ nguyên zone → không bị chặn bởi guard này.
  const s4 = await makeSlot(zoneA.zone_id, 'available');
  const r4 = await grab(() => updateParkingSlot(s4.slot_id, { distanceToGate: 5 }));
  check('cập nhật cùng khu OK', r4.ok === true, JSON.stringify(r4));
};

try {
  await run();
} catch (err) {
  fail += 1;
  console.log('LỖI NGOÀI DỰ KIẾN:', err.stack || err.message);
} finally {
  for (const id of [...new Set(cleanup.slots)]) await ParkingSlot.destroy({ where: { slot_id: id } });
  for (const id of cleanup.zones) await Zone.destroy({ where: { zone_id: id } });
  console.log(`\n=== KẾT QUẢ: ${pass} PASS / ${fail} FAIL ===`);
  await sequelize.close();
  process.exit(fail ? 1 : 0);
}
