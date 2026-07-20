// Acceptance test — RESERVATION MÔ HÌNH SỨC CHỨA (migration 008, chủ module chốt 18/07):
// đặt = giữ MỘT SUẤT trong khung giờ (đếm đơn trùng khung so với sức chứa tầng), KHÔNG ghim
// slot; slot thật gán lúc CHECK-IN (như vé tháng). Walk-in phải chừa chỗ cho đơn sắp tới (holdback).
// Gọi thẳng service/util. Tự dọn dữ liệu. Chạy: node scripts/testReservationCapacity.js
import 'dotenv/config';
delete process.env.PAYOS_CLIENT_ID; // không luồng nào trong test được chạm PayOS thật

import { Op } from 'sequelize';
import {
  Reservation,
  ParkingSession,
  ParkingSlot,
  Gate,
  Payment,
} from '../src/models/index.js';
import {
  getWindowAvailability,
  createReservation,
  cancelUserReservation,
  checkinReservation,
} from '../src/services/reservation.service.js';
import { suggestSlot } from '../src/utils/slotSuggest.js';
import {
  getReservationWindowCapacity,
  RESERVATION_HOLDBACK_LEAD_MS,
} from '../src/utils/reservationCapacity.js';
import { normalizePlateVN } from '../src/utils/plateVN.js';

const USER_ID = 4;  // seed: user
const STAFF_ID = 3; // seed: staff
const H = 3600 * 1000;
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

const TAG = 'cap-test';
const created = { reservations: [], sessions: [], slots: new Set() };

// Đơn KHÔNG slot (mô hình mới) — direct create, giờ hợp lệ vì cột nullable.
const makeBooking = async ({ base, plate, startMs, endMs, status = 'confirmed', userId = USER_ID }) => {
  const r = await Reservation.create({
    user_id: userId,
    vehicle_type_id: base.vehicleTypeId,
    floor_id: base.floorId,
    zone_id: base.zoneId ?? null,
    slot_id: null,
    plate_number: normalizePlateVN(plate),
    start_time: new Date(Date.now() + startMs),
    end_time: new Date(Date.now() + endMs),
    status,
    reservation_type: 'standard',
    qr_token: `${TAG}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  });
  created.reservations.push(r.reservation_id);
  return r;
};

const makeSquatterSession = async (base) => {
  const slot = await ParkingSlot.findOne({
    where: { zone_id: { [Op.in]: base.zoneIds }, status: 'available' },
    include: [{ association: 'zone' }],
  });
  await ParkingSlot.update({ status: 'occupied' }, { where: { slot_id: slot.slot_id } });
  const gate = await Gate.findOne({ where: { direction: 'in', is_active: true } });
  const s = await ParkingSession.create({
    user_id: null,
    gate_id: gate.gate_id,
    slot_id: slot.slot_id,
    vehicle_type_id: slot.zone.vehicle_type_id,
    plate_number: normalizePlateVN('94C-00000'),
    time_in: new Date(Date.now() - 3 * H),
    gate_stage: 'on_floor',
    qr_token: `${TAG}-squat-${Date.now()}`,
    check_in_by: STAFF_ID,
    session_type: 'walk_in',
    status: 'active',
  });
  created.sessions.push(s.session_id);
  created.slots.add(slot.slot_id);
  return s;
};

const iso = (ms) => new Date(Date.now() + ms).toISOString();

const run = async () => {
  // Chọn zone CAR có nhiều slot trống (8 chỗ seed) để đủ chỗ test.
  const slot = await ParkingSlot.findOne({
    where: { status: 'available' },
    include: [{ association: 'zone', where: { vehicle_type_id: 1 } }], // 1 = CAR
    order: [['slot_id', 'ASC']],
  });
  if (!slot) throw new Error('Hết slot CAR trống — seed lại DB');
  const base = { floorId: slot.zone.floor_id, vehicleTypeId: slot.zone.vehicle_type_id, zoneId: slot.zone_id };
  const capNow = await getReservationWindowCapacity({ ...base, startTime: iso(24 * H), endTime: iso(28 * H) });
  base.zoneIds = capNow.zoneIds;

  // W_A = mai 24-28h; W_B = mai sáng 10-14h (KHÔNG trùng W_A).
  const W_A = { startTime: iso(24 * H), endTime: iso(28 * H) };
  const W_B = { startTime: iso(10 * H), endTime: iso(14 * H) };

  console.log('=== TEST 1: lấp đầy sức chứa W_A → booking 409, W_B không trùng vẫn đặt được ===');
  const avail0 = (await getWindowAvailability({ ...base, ...W_A })).availableCount;
  check(`còn ${avail0} suất trong W_A trước khi lấp`, avail0 > 0, `avail0=${avail0}`);
  for (let i = 0; i < avail0; i++) {
    await makeBooking({ base, plate: `94D-1000${i}`, startMs: 24 * H, endMs: 28 * H });
  }
  const availFull = await getWindowAvailability({ ...base, ...W_A });
  check('W_A đầy → canBook=false, availableCount=0', availFull.canBook === false && availFull.availableCount === 0, JSON.stringify(availFull));
  const bookFull = await grab(() => createReservation(USER_ID, { ...base, plateNumber: '94D-19999', ...W_A }));
  check('createReservation W_A → 409 NO_SLOT_FOR_WINDOW', bookFull.status === 409 && bookFull.code === 'NO_SLOT_FOR_WINDOW', JSON.stringify(bookFull));
  const availB = await getWindowAvailability({ ...base, ...W_B });
  check('W_B (không trùng) vẫn canBook=true', availB.canBook === true, JSON.stringify(availB));

  console.log('=== TEST 2: session active chiếm slot → supply giảm cho MỌI cửa sổ ===');
  const availBeforeSquat = (await getWindowAvailability({ ...base, ...W_B })).availableCount;
  const squat = await makeSquatterSession(base);
  const afterSquat = await getWindowAvailability({ ...base, ...W_B });
  check('availableCount −1 sau khi xe chiếm 1 slot', afterSquat.availableCount === availBeforeSquat - 1, `${availBeforeSquat}→${afterSquat.availableCount}`);
  check('blockedByActiveSession phản ánh xe đang đỗ', afterSquat.blockedByActiveSession >= 1, JSON.stringify(afterSquat));

  console.log('=== TEST 3: cùng biển KHÔNG được 2 đơn trùng khung ===');
  const dupPlate = '94D-22222';
  await makeBooking({ base, plate: dupPlate, startMs: 50 * H, endMs: 54 * H });
  const dup = await grab(() => createReservation(USER_ID, { ...base, plateNumber: dupPlate, startTime: iso(50 * H), endTime: iso(54 * H) }));
  check('đơn trùng biển+khung → 409 CONFLICT', dup.status === 409 && dup.code === 'CONFLICT', JSON.stringify(dup));

  console.log('=== TEST 4: check-in đơn KHÔNG-slot → hệ gán slot thật, session cùng slot ===');
  const ciResv = await makeBooking({ base, plate: '94D-33333', startMs: -0.5 * H, endMs: 2 * H });
  check('đơn trước check-in có slot_id NULL', ciResv.slot_id === null);
  const ci = await grab(() => checkinReservation(STAFF_ID, { reservationId: ciResv.reservation_id }));
  check('check-in THÀNH CÔNG', ci.ok === true, JSON.stringify(ci));
  if (ci.ok) {
    created.sessions.push(ci.value.session.session_id);
    created.slots.add(ci.value.session.slot_id);
    check('reservation.slot_id được điền lúc check-in', ci.value.reservation.slot_id != null);
    check('session gắn ĐÚNG slot vừa gán', ci.value.session.slot_id === ci.value.reservation.slot_id);
    const assigned = await ParkingSlot.findByPk(ci.value.session.slot_id);
    check('slot chuyển occupied', assigned.status === 'occupied');
    check('slot gán thuộc zone ưu tiên', assigned.zone_id === base.zoneId);
  }

  console.log('=== TEST 5: holdback — walk-in bị chặn khi giữ chỗ = số chỗ trống ===');
  // Dọn đơn W_A đã lấp (giải phóng suất) để đo holdback trên nền sạch của tầng.
  await Reservation.update({ status: 'cancelled' }, { where: { reservation_id: { [Op.in]: created.reservations } } });
  const freeOnFloor = await ParkingSlot.count({
    where: { status: 'available' },
    include: [{ association: 'zone', required: true, where: { floor_id: base.floorId, vehicle_type_id: base.vehicleTypeId } }],
  });
  // Bơm đơn confirmed bắt đầu +1h (trong lead 6h) cho tới khi holdback == freeOnFloor.
  const holdIds = [];
  for (let i = 0; i < freeOnFloor; i++) {
    const r = await makeBooking({ base, plate: `94D-4000${i}`, startMs: 1 * H, endMs: 5 * H });
    holdIds.push(r.reservation_id);
  }
  const walkBlocked = await grab(() => suggestSlot({ floorId: base.floorId, vehicleTypeId: base.vehicleTypeId }));
  check('walk-in 409 WALKIN_HELD_FOR_RESERVATIONS khi holdback = chỗ trống', walkBlocked.status === 409 && walkBlocked.code === 'WALKIN_HELD_FOR_RESERVATIONS', JSON.stringify(walkBlocked));
  // Hủy 1 đơn giữ chỗ → còn dư → walk-in vào lại được.
  await Reservation.update({ status: 'cancelled' }, { where: { reservation_id: holdIds[0] } });
  const walkOk = await grab(() => suggestSlot({ floorId: base.floorId, vehicleTypeId: base.vehicleTypeId }));
  check('bỏ 1 đơn giữ chỗ → walk-in suggest được', walkOk.ok === true, JSON.stringify(walkOk.ok ? '' : walkOk));
  check('walk-in miễn holdback (skip=true) luôn qua', (await grab(() => suggestSlot({ floorId: base.floorId, vehicleTypeId: base.vehicleTypeId, skipReservationHoldback: true }))).ok === true);

  console.log(`\n==== KẾT QUẢ: ${pass} PASS / ${fail} FAIL ====`);
  return fail === 0;
};

const cleanup = async () => {
  await ParkingSession.destroy({ where: { session_id: { [Op.in]: created.sessions } } });
  await Payment.destroy({ where: { reservation_id: { [Op.in]: created.reservations } } });
  await Reservation.destroy({ where: { reservation_id: { [Op.in]: created.reservations } } });
  await Reservation.destroy({ where: { qr_token: { [Op.like]: `${TAG}-%` } } });
  if (created.slots.size) {
    await ParkingSlot.update({ status: 'available' }, { where: { slot_id: { [Op.in]: [...created.slots] } } });
  }
};

run()
  .then(async (ok) => { await cleanup(); process.exit(ok ? 0 : 1); })
  .catch(async (err) => {
    console.error('Test crash:', err);
    await cleanup().catch(() => {});
    process.exit(1);
  });
