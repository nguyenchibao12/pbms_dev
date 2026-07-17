// Verify — hình khối tòa nhà hợp lý:
//   (1) diện tích sàn KHÔNG TĂNG khi lên cao (hầm ≥ trệt ≥ tầng trên) ở mọi đường ghi tầng,
//   (2) mỗi cao độ chỉ MỘT tầng (floor_level trước đây không unique),
//   (3) cloneFloor copy area_m2/layout_mode/vehicle_type_id (trước đây bỏ sót → tầng clone
//       thành area NULL = không giới hạn diện tích, thoát mọi ràng buộc).
//
// Luật là TOÀN CỤC nên test không tự do chọn số: mọi tầng test nằm ở cao độ 88..97 (trên cùng,
// không đụng seed) → phải ≤ diện tích tầng cao nhất đang có. Lấy mốc CAP động từ DB rồi suy ra
// các số theo tỷ lệ, để test không vỡ khi seed đổi. Tự dọn.
// Chạy: node scripts/testFloorGeometryGuard.js
import 'dotenv/config';
import { Op } from 'sequelize';
import sequelize from '../src/config/db.js';
import { Floor, VehicleType, Zone, ParkingSlot, Gate } from '../src/models/index.js';
import { createFloor, updateFloor, cloneFloor, quickSetupFloor } from '../src/services/floor.service.js';

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

// Mã ngắn: zone_code clone sinh ra là "<mã tầng>-<mã loại xe>-NN", giới hạn VARCHAR(20).
const uniq = Date.now().toString().slice(-3);
const codes = [];
const mk = (suffix) => { const c = `G${uniq}${suffix}`; codes.push(c); return c; };
let vtId = null;

const run = async () => {
  // Trần diện tích của test = tầng CAO NHẤT đang có diện tích (seed: F3 = 120 m²).
  const top = await Floor.findOne({
    where: { area_m2: { [Op.not]: null } },
    order: [['floor_level', 'DESC']],
  });
  if (!top) throw new Error('DB chưa có tầng nào đặt diện tích — chạy npm run seed trước.');
  const CAP = Number(top.area_m2);
  const W = (ratio) => Math.round(CAP * ratio * 10) / 10;
  console.log(`Mốc: tầng cao nhất "${top.floor_code}" = ${CAP} m² (cao độ ${top.floor_level})\n`);

  const vt = await VehicleType.create({
    type_name: `GeoVT ${uniq}`, type_code: `V${uniq}`, slot_area_m2: 10,
  });
  vtId = vt.vehicle_type_id;

  console.log(`=== Dựng nền: cao độ 90 = ${W(0.8)} m² (≤ ${CAP} của tầng dưới) ===`);
  const r0 = await grab(() => createFloor({
    floorCode: mk('A'), floorLevel: 90, label: 'Geo 90', layoutMode: 'zoned', areaM2: W(0.8),
  }));
  check('tạo tầng nền OK', r0.ok === true, JSON.stringify(r0));

  console.log(`=== Tầng trên BẰNG diện tích (${W(0.8)}) → OK ===`);
  const r1 = await grab(() => createFloor({
    floorCode: mk('B'), floorLevel: 91, label: 'Geo 91', layoutMode: 'zoned', areaM2: W(0.8),
  }));
  check('bằng tầng dưới → cho phép', r1.ok === true, JSON.stringify(r1));

  console.log(`=== Tầng trên HẸP hơn (${W(0.6)}) → OK (tháp thu nhỏ dần) ===`);
  const r2 = await grab(() => createFloor({
    floorCode: mk('C'), floorLevel: 92, label: 'Geo 92', layoutMode: 'zoned', areaM2: W(0.6),
  }));
  check('nhỏ hơn tầng dưới → cho phép', r2.ok === true, JSON.stringify(r2));

  console.log(`=== Tầng trên RỘNG hơn tầng dưới (${W(0.7)} > ${W(0.6)}) → 409, KHÔNG tạo ===`);
  const r3 = await grab(() => createFloor({
    floorCode: mk('D'), floorLevel: 93, label: 'Geo 93', layoutMode: 'zoned', areaM2: W(0.7),
  }));
  check('chặn 409 CONFLICT', r3.ok === false && r3.status === 409, JSON.stringify(r3));
  check('không tạo tầng vi phạm', (await Floor.findOne({ where: { floor_level: 93 } })) === null);

  console.log(`=== CHÈN GIỮA: cao độ 89 nhưng hẹp hơn tầng TRÊN nó (${W(0.4)} < ${W(0.8)}) → 409 ===`);
  const r4 = await grab(() => createFloor({
    floorCode: mk('E'), floorLevel: 89, label: 'Geo 89', layoutMode: 'zoned', areaM2: W(0.4),
  }));
  check('kiểm cả hàng xóm phía TRÊN → 409', r4.ok === false && r4.status === 409, JSON.stringify(r4));

  console.log(`=== Chèn giữa đúng luật: cao độ 89 = ${W(0.9)} (rộng ra phía dưới) → OK ===`);
  const r5 = await grab(() => createFloor({
    floorCode: mk('F'), floorLevel: 89, label: 'Geo 89', layoutMode: 'zoned', areaM2: W(0.9),
  }));
  check('đào rộng ra ở tầng dưới → cho phép', r5.ok === true, JSON.stringify(r5));

  console.log('=== TRÙNG CAO ĐỘ: tạo tầng khác cũng ở 91 → 409 ===');
  const r6 = await grab(() => createFloor({
    floorCode: mk('G'), floorLevel: 91, label: 'Geo 91 bis', layoutMode: 'zoned', areaM2: W(0.5),
  }));
  check('chặn trùng cao độ 409', r6.ok === false && r6.status === 409, JSON.stringify(r6));
  check('cao độ 91 vẫn chỉ 1 tầng', (await Floor.count({ where: { floor_level: 91 } })) === 1);

  console.log(`=== UPDATE: nong tầng 92 từ ${W(0.6)} → ${W(0.9)} (rộng hơn tầng dưới ${W(0.8)}) → 409 ===`);
  const f92 = await Floor.findOne({ where: { floor_level: 92 } });
  const r7 = await grab(() => updateFloor(f92.floor_id, { areaM2: W(0.9) }));
  check('chặn 409 CONFLICT', r7.ok === false && r7.status === 409, JSON.stringify(r7));
  check('giữ nguyên diện tích cũ (không lưu)',
    Number((await Floor.findByPk(f92.floor_id)).area_m2) === W(0.6));

  console.log(`=== UPDATE hợp lệ: ${W(0.6)} → ${W(0.7)} (≤ ${W(0.8)} tầng dưới) → OK ===`);
  const r8 = await grab(() => updateFloor(f92.floor_id, { areaM2: W(0.7) }));
  check('cho phép', r8.ok === true, JSON.stringify(r8));
  check('đã lưu diện tích mới', Number((await Floor.findByPk(f92.floor_id)).area_m2) === W(0.7));

  console.log(`=== UPDATE dời CAO ĐỘ: tầng 92 (${W(0.7)}) xuống 88, dưới tầng 89 (${W(0.9)}) → 409 ===`);
  const r9 = await grab(() => updateFloor(f92.floor_id, { floorLevel: 88 }));
  check('dời cao độ làm vỡ luật → 409', r9.ok === false && r9.status === 409, JSON.stringify(r9));
  check('giữ nguyên cao độ 92', (await Floor.findByPk(f92.floor_id)).floor_level === 92);

  console.log(`=== CLONE tầng 92 (${W(0.7)} m², có 1 khu) lên cao độ 95 ===`);
  await Zone.create({
    floor_id: f92.floor_id, vehicle_type_id: vtId,
    zone_code: `GZ${uniq}`, label: 'Geo zone', total_slots: 8, monthly_pass_capacity: 0,
  });
  const cloneCode = mk('H');
  const r10 = await grab(() => cloneFloor(f92.floor_id, {
    floorCode: cloneCode, floorLevel: 95, label: 'Geo clone',
  }));
  check('clone OK', r10.ok === true, JSON.stringify(r10));
  const cloned = await Floor.findOne({ where: { floor_code: cloneCode } });
  check(`clone GIỮ area_m2 = ${W(0.7)} (trước đây NULL = vô hạn)`,
    cloned != null && Number(cloned.area_m2) === W(0.7), `area_m2=${cloned?.area_m2}`);
  check('clone giữ layout_mode', cloned?.layout_mode === f92.layout_mode);

  console.log(`=== QUICK SETUP: tầng 96 rộng ${W(5)} m² (vượt tầng dưới) → 409 ===`);
  const r11 = await grab(() => quickSetupFloor({
    floor: { floorCode: mk('I'), floorLevel: 96, label: 'Geo 96', areaM2: W(5) },
    zones: [{ vehicleTypeId: vtId, label: 'Z', slotCount: 5 }],
    gates: { auto: false },
  }));
  check('quickSetup chặn 409', r11.ok === false && r11.status === 409, JSON.stringify(r11));
  check('không tạo tầng vi phạm', (await Floor.findOne({ where: { floor_level: 96 } })) === null);

  console.log('=== Tầng area_m2 = NULL (legacy) → bỏ qua, không chặn ===');
  const r12 = await grab(() => createFloor({
    floorCode: mk('J'), floorLevel: 97, label: 'Geo legacy', layoutMode: 'zoned',
  }));
  check('tầng không đặt diện tích vẫn tạo được', r12.ok === true, JSON.stringify(r12));
};

try {
  await run();
} catch (err) {
  fail += 1;
  console.log('LỖI NGOÀI DỰ KIẾN:', err.stack || err.message);
} finally {
  const floors = await Floor.findAll({ where: { floor_code: codes } });
  for (const f of floors) {
    const zones = await Zone.findAll({ where: { floor_id: f.floor_id } });
    for (const z of zones) {
      await ParkingSlot.destroy({ where: { zone_id: z.zone_id } });
      await Zone.destroy({ where: { zone_id: z.zone_id } });
    }
    await Gate.destroy({ where: { floor_id: f.floor_id } });
    await Floor.destroy({ where: { floor_id: f.floor_id } });
  }
  if (vtId) await VehicleType.destroy({ where: { vehicle_type_id: vtId } });
  console.log(`\n=== KẾT QUẢ: ${pass} PASS / ${fail} FAIL ===`);
  await sequelize.close();
  process.exit(fail ? 1 : 0);
}
