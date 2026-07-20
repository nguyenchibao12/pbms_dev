// Acceptance test — KHÓA-ĐẦU-CA + BẬC THANG FALLBACK (chủ module chốt 20/07):
//   - Job Ca C: đơn confirmed tới ca (start<=now<end) chưa có slot → giữ 1 slot 'reserved'.
//   - Walk-in KHÔNG cướp được slot 'reserved'.
//   - Check-in bậc 1: chiếm chính slot đã khóa sẵn.
//   - Check-in bậc 3: tầng đặt hết → tự chuyển tầng khác (floorReassigned).
//   - Check-in bậc 4: cả tòa hết → 409 BUILDING_FULL_REFUNDED + hủy đơn + tạo refund 100%.
//   - Nhả slot 'reserved' khi hủy / no-show.
//   - Capacity KHÔNG double-count đơn đã materialize.
// Gọi thẳng service/util. Tự dọn dữ liệu. Chạy: node scripts/testShiftStartLock.js
import 'dotenv/config';
delete process.env.PAYOS_CLIENT_ID; // không luồng nào chạm PayOS thật

import { Op } from 'sequelize';
import {
  Reservation,
  ParkingSession,
  ParkingSlot,
  Zone,
  Gate,
  Payment,
  RefundRequest,
} from '../src/models/index.js';
import {
  materializeReservationSlot,
  checkinReservation,
  cancelUserReservation,
  markReservationNoShow,
  getWindowAvailability,
} from '../src/services/reservation.service.js';
import { checkin } from '../src/services/session.service.js';
import { suggestSlot } from '../src/utils/slotSuggest.js';
import { getReservationWindowCapacity } from '../src/utils/reservationCapacity.js';
import { normalizePlateVN } from '../src/utils/plateVN.js';

const USER_ID = 4;
const STAFF_ID = 3;
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

const TAG = 'shiftlock-test';
const created = { reservations: [], sessions: [], slots: new Set() };

// Đơn confirmed đã TỚI CA (start 30' trước, end +3h) trên (floor, vt) — chưa có slot.
const makeStartedBooking = async ({ base, plate }) => {
  const r = await Reservation.create({
    user_id: USER_ID,
    vehicle_type_id: base.vehicleTypeId,
    floor_id: base.floorId,
    zone_id: base.zoneId ?? null,
    slot_id: null,
    plate_number: normalizePlateVN(plate),
    start_time: new Date(Date.now() - 0.5 * H),
    end_time: new Date(Date.now() + 3 * H),
    status: 'confirmed',
    reservation_type: 'afternoon',
    qr_token: `${TAG}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  });
  created.reservations.push(r.reservation_id);
  return r;
};

// Chiếm HẾT slot 'available' của 1 tầng bằng session walk-in giả (để ép tầng đầy).
const fillFloor = async (floorId, vehicleTypeId) => {
  const zones = await Zone.findAll({ where: { floor_id: floorId, vehicle_type_id: vehicleTypeId }, attributes: ['zone_id'] });
  const zoneIds = zones.map((z) => z.zone_id);
  const slots = await ParkingSlot.findAll({ where: { zone_id: { [Op.in]: zoneIds }, status: 'available' } });
  const gate = await Gate.findOne({ where: { direction: 'in', is_active: true } });
  for (const slot of slots) {
    await slot.update({ status: 'occupied' });
    const s = await ParkingSession.create({
      user_id: null, gate_id: gate.gate_id, slot_id: slot.slot_id,
      vehicle_type_id: vehicleTypeId, plate_number: normalizePlateVN(`52F-${10000 + (slot.slot_id % 89999)}`),
      time_in: new Date(Date.now() - H), gate_stage: 'on_floor',
      qr_token: `${TAG}-fill-${slot.slot_id}-${Date.now()}`, check_in_by: STAFF_ID,
      session_type: 'walk_in', status: 'active',
    });
    created.sessions.push(s.session_id);
    created.slots.add(slot.slot_id);
  }
  return slots.length;
};

const run = async () => {
  // Zone CAR có nhiều slot trống để test.
  const slot = await ParkingSlot.findOne({
    where: { status: 'available' },
    include: [{ association: 'zone', where: { vehicle_type_id: 1 } }],
    order: [['slot_id', 'ASC']],
  });
  if (!slot) throw new Error('Hết slot CAR — seed lại DB');
  const base = { floorId: slot.zone.floor_id, vehicleTypeId: slot.zone.vehicle_type_id, zoneId: slot.zone_id };

  console.log('=== TEST 1: job khóa-đầu-ca → đơn tới ca được giữ 1 slot reserved ===');
  const r1 = await makeStartedBooking({ base, plate: '93A-10001' });
  const m1 = await materializeReservationSlot(r1.reservation_id);
  check('materialize locked=true', m1.locked === true, JSON.stringify(m1));
  const r1r = await Reservation.findByPk(r1.reservation_id);
  check('đơn được gán slot_id', r1r.slot_id != null);
  if (r1r.slot_id) created.slots.add(r1r.slot_id);
  const lockedSlot = await ParkingSlot.findByPk(r1r.slot_id);
  check("slot đó status = 'reserved'", lockedSlot?.status === 'reserved', `(hiện: ${lockedSlot?.status})`);
  const m1again = await materializeReservationSlot(r1.reservation_id);
  check('idempotent: gọi lại → locked=false (đã có slot)', m1again.locked === false);

  console.log('=== TEST 2: walk-in KHÔNG cướp được slot đã reserved ===');
  // Đơn r1 giữ chỗ trong 6h → holdback + slot reserved. Walk-in biển khác ở tầng r1:
  const w2 = await grab(() => suggestSlot({ floorId: base.floorId, vehicleTypeId: base.vehicleTypeId, zoneId: base.zoneId }));
  if (w2.ok) {
    check('walk-in suggest KHÔNG trả trúng slot đang reserved', w2.value.slot.slot_id !== r1r.slot_id, `trả ${w2.value.slot.slot_id} vs reserved ${r1r.slot_id}`);
  } else {
    check('walk-in bị chặn (holdback/hết chỗ) — cũng chấp nhận', ['WALKIN_HELD_FOR_RESERVATIONS', 'CONFLICT', 'PASS_CAPACITY_RESERVED'].includes(w2.code), JSON.stringify(w2));
  }

  console.log('=== TEST 3: check-in bậc 1 → chiếm chính slot đã khóa sẵn ===');
  const ci = await grab(() => checkinReservation(STAFF_ID, { reservationId: r1.reservation_id }));
  check('check-in thành công', ci.ok === true, JSON.stringify(ci));
  if (ci.ok) {
    created.sessions.push(ci.value.session.session_id);
    check('session chiếm ĐÚNG slot đã khóa sẵn', ci.value.session.slot_id === r1r.slot_id);
    check('không đổi tầng (floorReassigned=false)', ci.value.floorReassigned === false);
    const s = await ParkingSlot.findByPk(r1r.slot_id);
    check("slot chuyển 'occupied'", s?.status === 'occupied');
  }

  console.log('=== TEST 4: nhả slot reserved khi HỦY đơn đã khóa ===');
  const r4 = await makeStartedBooking({ base, plate: '93A-10004' });
  await materializeReservationSlot(r4.reservation_id);
  const r4r = await Reservation.findByPk(r4.reservation_id);
  if (r4r.slot_id) created.slots.add(r4r.slot_id);
  check('r4 đã khóa slot', r4r.slot_id != null);
  await cancelUserReservation(USER_ID, r4.reservation_id);
  const s4 = await ParkingSlot.findByPk(r4r.slot_id);
  check("hủy → slot nhả về 'available'", s4?.status === 'available', `(hiện: ${s4?.status})`);

  console.log('=== TEST 5: nhả slot reserved khi NO-SHOW ===');
  const r5 = await makeStartedBooking({ base, plate: '93A-10005' });
  await materializeReservationSlot(r5.reservation_id);
  const r5r = await Reservation.findByPk(r5.reservation_id);
  if (r5r.slot_id) created.slots.add(r5r.slot_id);
  // ép end_time về quá khứ để no-show hợp lệ
  await Reservation.update({ end_time: new Date(Date.now() - H) }, { where: { reservation_id: r5.reservation_id } });
  await markReservationNoShow(r5.reservation_id);
  const s5 = await ParkingSlot.findByPk(r5r.slot_id);
  check("no-show → slot nhả về 'available'", s5?.status === 'available', `(hiện: ${s5?.status})`);
  check('đơn thành no_show', (await Reservation.findByPk(r5.reservation_id)).status === 'no_show');

  console.log('=== TEST 6: capacity KHÔNG double-count đơn đã materialize ===');
  // Trước: đơn chưa materialize. Sau materialize: available phải GIỮ NGUYÊN (slot reserved rời
  // supply nhưng đơn vẫn nằm trong booked → triệt tiêu; không được tụt thêm).
  const r6 = await makeStartedBooking({ base, plate: '93A-10006' });
  // Dùng thẳng util capacity (không qua validate future-start): đo available của ca đang diễn ra.
  const win = { startTime: new Date(Date.now() - 0.5 * H), endTime: new Date(Date.now() + 3 * H) };
  const availBefore = (await getReservationWindowCapacity({ ...base, ...win })).available;
  await materializeReservationSlot(r6.reservation_id);
  const r6r = await Reservation.findByPk(r6.reservation_id);
  if (r6r.slot_id) created.slots.add(r6r.slot_id);
  const availAfter = (await getReservationWindowCapacity({ ...base, ...win })).available;
  check('available giữ nguyên sau materialize (không double-count)', availBefore === availAfter, `${availBefore}→${availAfter}`);
  await cancelUserReservation(USER_ID, r6.reservation_id);

  console.log('=== TEST 7: bậc 3 — tầng đặt HẾT → tự chuyển tầng khác (walk the guest) ===');
  // Chọn 1 tầng zoned có tầng khác cùng loại xe. Lấp đầy tầng đặt, để đơn không materialize được,
  // rồi check-in → phải nhảy sang tầng khác.
  const r7 = await makeStartedBooking({ base, plate: '93A-10007' });
  const filled = await fillFloor(base.floorId, base.vehicleTypeId);
  check(`đã lấp đầy tầng đặt (${filled} slot)`, filled >= 0);
  const otherFloorSlotBefore = await ParkingSlot.findOne({
    where: { status: 'available' },
    include: [{ association: 'zone', required: true, where: { vehicle_type_id: base.vehicleTypeId, floor_id: { [Op.ne]: base.floorId } } }],
  });
  if (!otherFloorSlotBefore) {
    check('bỏ qua TEST 7: không có tầng khác còn trống cùng loại xe', true);
  } else {
    const ci7 = await grab(() => checkinReservation(STAFF_ID, { reservationId: r7.reservation_id }));
    check('check-in thành công qua bậc 3', ci7.ok === true, JSON.stringify(ci7));
    if (ci7.ok) {
      created.sessions.push(ci7.value.session.session_id);
      created.slots.add(ci7.value.session.slot_id);
      check('floorReassigned = true', ci7.value.floorReassigned === true, JSON.stringify(ci7.value.reassignedTo));
      const assignedSlot = await ParkingSlot.findByPk(ci7.value.session.slot_id, { include: [{ association: 'zone' }] });
      check('slot gán thuộc TẦNG KHÁC tầng đặt', assignedSlot.zone.floor_id !== base.floorId, `gán floor ${assignedSlot.zone.floor_id} vs đặt ${base.floorId}`);
    }
  }

  console.log('=== TEST 8: bậc 4 — CẢ TÒA hết → 409 BUILDING_FULL_REFUNDED + hủy đơn + refund 100% ===');
  const carFloorZones = await Zone.findAll({ where: { vehicle_type_id: base.vehicleTypeId }, attributes: ['floor_id'] });
  const carFloorIds = [...new Set(carFloorZones.map((z) => z.floor_id))];
  for (const fid of carFloorIds) await fillFloor(fid, base.vehicleTypeId); // lấp nốt mọi tầng cùng loại xe
  const r8 = await makeStartedBooking({ base, plate: '93A-10008' });
  await Payment.create({
    reservation_id: r8.reservation_id, order_code: Math.floor(Date.now() / 1000) * 1000 + 8,
    amount: 20000, status: 'success', method: 'payos', paid_at: new Date(),
  });
  const ci8 = await grab(() => checkinReservation(STAFF_ID, { reservationId: r8.reservation_id }));
  check('check-in bị 409 BUILDING_FULL_REFUNDED', ci8.ok === false && ci8.status === 409 && ci8.code === 'BUILDING_FULL_REFUNDED', JSON.stringify(ci8));
  check('đơn bị hủy', (await Reservation.findByPk(r8.reservation_id)).status === 'cancelled');
  const refund8 = await RefundRequest.findOne({ where: { reservation_id: r8.reservation_id } });
  check('có RefundRequest 100% pending', refund8 && refund8.percent === 100 && refund8.status === 'pending', JSON.stringify(refund8));

  console.log(`\n==== KẾT QUẢ: ${pass} PASS / ${fail} FAIL ====`);
  return fail === 0;
};

const cleanup = async () => {
  await ParkingSession.destroy({ where: { session_id: { [Op.in]: created.sessions } } }).catch(() => {});
  await Payment.destroy({ where: { reservation_id: { [Op.in]: created.reservations } } }).catch(() => {});
  await RefundRequest.destroy({ where: { reservation_id: { [Op.in]: created.reservations } } }).catch(() => {});
  await Reservation.destroy({ where: { reservation_id: { [Op.in]: created.reservations } } }).catch(() => {});
  await Reservation.destroy({ where: { qr_token: { [Op.like]: `${TAG}-%` } } }).catch(() => {});
  if (created.slots.size) {
    await ParkingSlot.update({ status: 'available' }, { where: { slot_id: { [Op.in]: [...created.slots] } } }).catch(() => {});
  }
};

run()
  .then(async (ok) => { await cleanup(); process.exit(ok ? 0 : 1); })
  .catch(async (err) => {
    console.error('Test crash:', err);
    await cleanup().catch(() => {});
    process.exit(1);
  });
