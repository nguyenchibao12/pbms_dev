/**
 * Regression — check-in VÉ THÁNG KHÔNG bị filter walk-in (OR-03) tự chặn chính chủ vé.
 *
 * Bug (handoff BE reservation → module vé tháng): tầng dành riêng vé tháng (capacity ≈ tổng slot),
 * chủ vé lúc quét CHƯA có phiên → headroom vẫn tính cả suất của họ → filterWalkInCandidateSlots
 * loại sạch khu → 'PASS_CAPACITY_RESERVED'. Sửa: suggestSlot thêm cờ skipPassCapacity; checkinWithPass
 * truyền true (overselling đã chống ở lúc BÁN vé — getPassCapacity khóa Zone).
 *
 * Fixture: 1 tầng + 1 khu vé-tháng-full (total_slots == monthly_pass_capacity), chưa ai đỗ.
 *  - suggestSlot mặc định (walk-in)      → vẫn phải bị chặn OR-03  (không hồi quy walk-in guard)
 *  - suggestSlot skipPassCapacity:true   → phải lấy được slot      (chủ vé không bị khóa oan)
 *
 * Chạy:  node scripts/testPassCheckinFilter.js   (trong thư mục server) — TỰ DỌN fixture.
 */
import dotenv from 'dotenv';
import sequelize from '../src/config/db.js';
import { Floor, VehicleType, Zone, ParkingSlot } from '../src/models/index.js';
import { suggestSlot } from '../src/utils/slotSuggest.js';

let pass = 0;
let fail = 0;
const ok = (cond, msg) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? 'PASS' : 'FAIL'} | ${msg}`);
};

const FLOOR_CODE = 'ZZTEST';
const ZONE_CODE = 'ZZTEST-BIKE-01';

const cleanup = async () => {
  const floor = await Floor.findOne({ where: { floor_code: FLOOR_CODE } });
  if (!floor) return;
  const zones = await Zone.findAll({ where: { floor_id: floor.floor_id } });
  for (const z of zones) await ParkingSlot.destroy({ where: { zone_id: z.zone_id } });
  await Zone.destroy({ where: { floor_id: floor.floor_id } });
  await Floor.destroy({ where: { floor_id: floor.floor_id } });
};

const run = async () => {
  await sequelize.authenticate();
  console.log('DB connected. Test check-in vé tháng không bị filter walk-in chặn...\n');
  await cleanup(); // dọn tàn dư lần chạy trước (nếu có)

  const bike = await VehicleType.findOne({ where: { type_code: 'BIKE' } });
  if (!bike) throw new Error('Cần loại xe BIKE (chạy seed trước).');

  // Fixture: khu vé-tháng-full — total_slots == capacity, chưa ai đỗ ⇒ headroom == số slot trống.
  const floor = await Floor.create({
    floor_code: FLOOR_CODE, floor_level: 97, label: 'Tầng test', layout_mode: 'zoned', area_m2: null,
  });
  const zone = await Zone.create({
    floor_id: floor.floor_id, vehicle_type_id: bike.vehicle_type_id, zone_code: ZONE_CODE,
    label: 'Khu test vé tháng full', total_slots: 3, monthly_pass_capacity: 3,
  });
  for (let i = 1; i <= 3; i++) {
    await ParkingSlot.create({
      zone_id: zone.zone_id, slot_code: `${ZONE_CODE}-0${i}`, status: 'available',
    });
  }

  const args = { floorId: floor.floor_id, vehicleTypeId: bike.vehicle_type_id };

  console.log('① Walk-in (mặc định) — walk-in guard PHẢI còn chặn (không hồi quy):');
  try {
    const r = await suggestSlot({ ...args });
    ok(false, `đáng lẽ bị chặn OR-03 nhưng lại lấy được slot ${r.slot?.slot_code}`);
  } catch (e) {
    ok(e.code === 'PASS_CAPACITY_RESERVED', `vẫn bị chặn OR-03 (code=${e.code})`);
  }

  console.log('\n② Check-in VÉ THÁNG (skipPassCapacity:true) — chủ vé PHẢI lấy được slot:');
  try {
    const r = await suggestSlot({ ...args, skipReservationHoldback: true, skipPassCapacity: true });
    ok(!!r.slot, `lấy được slot ${r.slot?.slot_code} (không còn bị OR-03 khóa oan)`);
  } catch (e) {
    ok(false, `đáng lẽ lấy được slot nhưng lỗi: ${e.code} — ${e.message}`);
  }

  await cleanup();
  console.log(`\n==== KẾT QUẢ: ${pass} PASS / ${fail} FAIL ====`);
};

run()
  .catch((err) => {
    console.error('\nLỗi chạy test:', err.message);
    fail++;
  })
  .finally(async () => {
    await cleanup().catch(() => {});
    await sequelize.close();
    process.exit(fail > 0 ? 1 : 0);
  });
