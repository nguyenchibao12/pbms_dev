// Verify — updateVehicleType chặn TĂNG slot_area_m2 nếu làm khu đang dùng loại xe đó vượt
// diện tích tầng (trước đây đổi ở loại xe không ai kiểm → vỡ ràng buộc âm thầm). Giảm thì luôn OK.
// Dựng cảnh: floor area=100, loại xe slot=10, 1 khu 9 slot (=90 m²). Tự dọn.
// Chạy: node scripts/testVehicleTypeAreaRevalidate.js
import 'dotenv/config';
import sequelize from '../src/config/db.js';
import { Floor, VehicleType, Zone } from '../src/models/index.js';
import { updateVehicleType } from '../src/services/vehicleType.service.js';

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
const cleanup = { zones: [], floors: [], types: [] };

const run = async () => {
  const floor = await Floor.create({
    floor_code: `TSF${uniq}`, floor_level: 99, label: 'Area test floor',
    layout_mode: 'zoned', area_m2: 100,
  });
  cleanup.floors.push(floor.floor_id);

  const vt = await VehicleType.create({
    type_name: `AreaVT ${uniq}`, type_code: `AVT${uniq}`, slot_area_m2: 10,
  });
  cleanup.types.push(vt.vehicle_type_id);

  const zone = await Zone.create({
    floor_id: floor.floor_id, vehicle_type_id: vt.vehicle_type_id,
    zone_code: `AVZ${uniq}`, label: 'Area zone', total_slots: 9, monthly_pass_capacity: 0,
  });
  cleanup.zones.push(zone.zone_id);

  console.log('=== 9 slot × 10 = 90/100 m². Tăng lên 11 → 99 ≤ 100 → OK ===');
  const r1 = await grab(() => updateVehicleType(vt.vehicle_type_id, { slotAreaM2: 11 }));
  check('cho phép (99 ≤ 100)', r1.ok === true, JSON.stringify(r1));
  check('đã lưu slot_area_m2 = 11', Number((await VehicleType.findByPk(vt.vehicle_type_id)).slot_area_m2) === 11);

  console.log('=== Tăng tiếp lên 12 → 9×12 = 108 > 100 → 409, KHÔNG lưu ===');
  const r2 = await grab(() => updateVehicleType(vt.vehicle_type_id, { slotAreaM2: 12 }));
  check('chặn 409 CONFLICT', r2.ok === false && r2.status === 409, JSON.stringify(r2));
  check('giữ nguyên slot_area_m2 = 11 (không lưu)', Number((await VehicleType.findByPk(vt.vehicle_type_id)).slot_area_m2) === 11);

  console.log('=== GIẢM xuống 5 → luôn vừa → OK (không cần kiểm) ===');
  const r3 = await grab(() => updateVehicleType(vt.vehicle_type_id, { slotAreaM2: 5 }));
  check('cho phép giảm', r3.ok === true, JSON.stringify(r3));
  check('đã lưu slot_area_m2 = 5', Number((await VehicleType.findByPk(vt.vehicle_type_id)).slot_area_m2) === 5);

  console.log('=== Đổi TÊN (không đụng diện tích) vẫn OK ===');
  const r4 = await grab(() => updateVehicleType(vt.vehicle_type_id, { typeName: `Renamed ${uniq}` }));
  check('đổi tên OK', r4.ok === true, JSON.stringify(r4));
};

try {
  await run();
} catch (err) {
  fail += 1;
  console.log('LỖI NGOÀI DỰ KIẾN:', err.stack || err.message);
} finally {
  for (const id of cleanup.zones) await Zone.destroy({ where: { zone_id: id } });
  for (const id of cleanup.floors) await Floor.destroy({ where: { floor_id: id } });
  for (const id of cleanup.types) await VehicleType.destroy({ where: { vehicle_type_id: id } });
  console.log(`\n=== KẾT QUẢ: ${pass} PASS / ${fail} FAIL ===`);
  await sequelize.close();
  process.exit(fail ? 1 : 0);
}
