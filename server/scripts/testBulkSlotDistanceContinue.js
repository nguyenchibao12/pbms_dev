/**
 * Regression — sinh chỗ HÀNG LOẠT lần 2 phải NỐI TIẾP khoảng cách (không bỏ trống "Cách cổng").
 *
 * Bug: lô 1 nhập distanceStart/step → có khoảng cách; lô 2 (khu đã có chỗ) không nhập lại →
 * distance_to_gate = null → cột "Cách cổng" trống. Sửa: bulkGenerateSlots tự nối tiếp dãy cũ
 * (xa nhất + 1 bước; suy bước từ 2 mốc lớn nhất nếu không nhập).
 *
 * Chạy:  node scripts/testBulkSlotDistanceContinue.js   (trong thư mục server) — TỰ DỌN fixture.
 */
import dotenv from 'dotenv';
import sequelize from '../src/config/db.js';
import { Floor, VehicleType, Zone, ParkingSlot } from '../src/models/index.js';
import { bulkGenerateSlots } from '../src/services/parkingSlot.service.js';

let pass = 0;
let fail = 0;
const ok = (cond, msg) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? 'PASS' : 'FAIL'} | ${msg}`);
};

const FLOOR_CODE = 'ZBULK';

const cleanup = async () => {
  const floor = await Floor.findOne({ where: { floor_code: FLOOR_CODE } });
  if (!floor) return;
  const zones = await Zone.findAll({ where: { floor_id: floor.floor_id } });
  for (const z of zones) await ParkingSlot.destroy({ where: { zone_id: z.zone_id } });
  await Zone.destroy({ where: { floor_id: floor.floor_id } });
  await Floor.destroy({ where: { floor_id: floor.floor_id } });
};

const distancesOf = async (zoneId) => {
  const slots = await ParkingSlot.findAll({
    where: { zone_id: zoneId }, order: [['slot_code', 'ASC']],
    attributes: ['slot_code', 'distance_to_gate'],
  });
  return slots.map((s) => [s.slot_code.replace(/^.*-/, ''), s.distance_to_gate == null ? null : Number(s.distance_to_gate)]);
};

const run = async () => {
  await sequelize.authenticate();
  console.log('DB connected. Test nối tiếp khoảng cách khi sinh hàng loạt...\n');
  await cleanup();

  const bike = await VehicleType.findOne({ where: { type_code: 'BIKE' } });
  if (!bike) throw new Error('Cần loại xe BIKE (chạy seed trước).');

  const floor = await Floor.create({
    floor_code: FLOOR_CODE, floor_level: 96, label: 'Tầng test bulk', layout_mode: 'zoned', area_m2: null,
  });
  const zone = await Zone.create({
    floor_id: floor.floor_id, vehicle_type_id: bike.vehicle_type_id, zone_code: 'ZBULK-BIKE-01',
    label: 'Khu test bulk', total_slots: 12, monthly_pass_capacity: 0,
  });

  console.log('① Lô 1: count=5, distanceStart=2, step=2 → 2,4,6,8,10');
  await bulkGenerateSlots(zone.zone_id, { count: 5, distanceStart: 2, distanceStep: 2 });
  let d = await distancesOf(zone.zone_id);
  ok(JSON.stringify(d.map((x) => x[1])) === JSON.stringify([2, 4, 6, 8, 10]),
    `khoảng cách sau lô 1 = ${JSON.stringify(d.map((x) => x[1]))}`);

  console.log('\n② Lô 2: count=3, KHÔNG nhập distance → phải NỐI TIẾP 12,14,16');
  await bulkGenerateSlots(zone.zone_id, { count: 3 });
  d = await distancesOf(zone.zone_id);
  const last3 = d.slice(-3).map((x) => x[1]);
  ok(JSON.stringify(last3) === JSON.stringify([12, 14, 16]),
    `khoảng cách 3 chỗ mới = ${JSON.stringify(last3)} (mong [12,14,16], KHÔNG null)`);
  ok(!last3.includes(null), 'không còn chỗ mới nào bị trống "Cách cổng"');

  console.log('\n③ Không hồi quy: khu MỚI, sinh không nhập distance → null (không tự bịa)');
  const zone2 = await Zone.create({
    floor_id: floor.floor_id, vehicle_type_id: bike.vehicle_type_id, zone_code: 'ZBULK-BIKE-02',
    label: 'Khu test bulk 2', total_slots: 3, monthly_pass_capacity: 0,
  });
  await bulkGenerateSlots(zone2.zone_id, { count: 2 });
  const d2 = await distancesOf(zone2.zone_id);
  ok(d2.every((x) => x[1] === null), `khu trống + không nhập → tất cả null (${JSON.stringify(d2.map((x) => x[1]))})`);

  await cleanup();
  console.log(`\n==== KẾT QUẢ: ${pass} PASS / ${fail} FAIL ====`);
};

run()
  .catch((err) => { console.error('\nLỗi chạy test:', err.message); fail++; })
  .finally(async () => { await cleanup().catch(() => {}); await sequelize.close(); process.exit(fail > 0 ? 1 : 0); });
