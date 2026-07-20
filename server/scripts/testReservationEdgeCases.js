// EDGE / UNIT / LIMIT test cho lớp KHÓA-ĐẦU-CA + fallback (bổ sung cho testShiftStartLock).
//   A. UNIT   — chuyển trạng thái slot: reserve/release/occupy (biên + idempotent).
//   B. EDGE   — materializeReservationSlot guard: chưa tới ca / hết ca / pending / checked_in / đã có slot.
//   C. EDGE   — holdback: đơn ĐÃ materialize KHÔNG giữ chỗ walk-in; đơn CHƯA materialize thì có.
//   D. EDGE   — check-in bậc 1 slot bị chiếm mất → tụt xuống bậc 2 (gán slot khác cùng tầng).
//   E. LIMIT  — capacity: available kẹp ở 0 (không âm) khi supply < booked.
// Gọi thẳng service/util. Tự dọn. Chạy: node scripts/testReservationEdgeCases.js
import 'dotenv/config';
delete process.env.PAYOS_CLIENT_ID;

import { Op } from 'sequelize';
import sequelize from '../src/config/db.js';
import {
  Reservation, ParkingSession, ParkingSlot, Zone, Floor, Gate, Payment, RefundRequest,
} from '../src/models/index.js';
import {
  reserveSlotForReservation, releaseReservedSlot, occupySlotForReservation,
} from '../src/utils/slotSuggest.js';
import {
  getReservationWindowCapacity, filterWalkInCandidatesForUpcomingReservations,
} from '../src/utils/reservationCapacity.js';
import { materializeReservationSlot, checkinReservation } from '../src/services/reservation.service.js';
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
  catch (err) { return { ok: false, code: err.code, status: err.statusCode }; }
};
const inTx = (fn) => sequelize.transaction(fn);

const TAG = 'edge-test';
const created = { reservations: [], sessions: [], slots: new Set() };
let plateSeq = 0;
const nextPlate = () => normalizePlateVN(`97A-${10000 + (plateSeq++)}`);

const makeResv = async ({ base, status = 'confirmed', startMs, endMs, slotId = null }) => {
  const r = await Reservation.create({
    user_id: USER_ID, vehicle_type_id: base.vehicleTypeId, floor_id: base.floorId,
    zone_id: base.zoneId ?? null, slot_id: slotId, plate_number: nextPlate(),
    start_time: new Date(Date.now() + startMs), end_time: new Date(Date.now() + endMs),
    status, reservation_type: 'afternoon',
    qr_token: `${TAG}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  });
  created.reservations.push(r.reservation_id);
  return r;
};

// Chiếm n slot 'available' của (floor, vt) bằng session giả → giảm supply/freeOnFloor.
const occupyN = async (zoneIds, vehicleTypeId, n) => {
  if (n <= 0) return 0;
  const slots = await ParkingSlot.findAll({ where: { zone_id: { [Op.in]: zoneIds }, status: 'available' }, limit: n });
  const gate = await Gate.findOne({ where: { direction: 'in', is_active: true } });
  for (const s of slots) {
    await s.update({ status: 'occupied' });
    const sess = await ParkingSession.create({
      user_id: null, gate_id: gate.gate_id, slot_id: s.slot_id, vehicle_type_id: vehicleTypeId,
      plate_number: normalizePlateVN(`52F-${10000 + (s.slot_id % 89999)}`), time_in: new Date(Date.now() - H),
      gate_stage: 'on_floor', qr_token: `${TAG}-occ-${s.slot_id}-${Date.now()}`, check_in_by: STAFF_ID,
      session_type: 'walk_in', status: 'active',
    });
    created.sessions.push(sess.session_id);
    created.slots.add(s.slot_id);
  }
  return slots.length;
};

const freeCount = (zoneIds) => ParkingSlot.count({ where: { zone_id: { [Op.in]: zoneIds }, status: 'available' } });

const run = async () => {
  // Tầng SẠCH khỏi đơn seed: F2 (car) — seed chỉ đặt trên F1.
  const f2 = await Floor.findOne({ where: { floor_code: 'F2' } });
  const zone = await Zone.findOne({ where: { floor_id: f2.floor_id, vehicle_type_id: 1 } });
  const base = { floorId: f2.floor_id, vehicleTypeId: 1, zoneId: zone.zone_id };
  const zoneIds = [zone.zone_id];

  console.log('=== A. UNIT: chuyển trạng thái slot (reserve/release/occupy) ===');
  const freeSlot = await ParkingSlot.findOne({ where: { zone_id: zone.zone_id, status: 'available' }, order: [['slot_id', 'ASC']] });
  created.slots.add(freeSlot.slot_id);
  await inTx((t) => reserveSlotForReservation(freeSlot.slot_id, t));
  check("available → reserved OK", (await ParkingSlot.findByPk(freeSlot.slot_id)).status === 'reserved');
  const reReserve = await grab(() => inTx((t) => reserveSlotForReservation(freeSlot.slot_id, t)));
  check("reserve slot đang reserved → SLOT_BUSY", reReserve.ok === false && reReserve.code === 'SLOT_BUSY', JSON.stringify(reReserve));
  let rel;
  await inTx(async (t) => { rel = await releaseReservedSlot(freeSlot.slot_id, t); });
  check("release reserved → true + về available", rel === true && (await ParkingSlot.findByPk(freeSlot.slot_id)).status === 'available');
  await inTx(async (t) => { rel = await releaseReservedSlot(freeSlot.slot_id, t); });
  check("release slot KHÔNG reserved → false (idempotent no-op)", rel === false);
  check("release slotId null → false", (await releaseReservedSlot(null)) === false);
  await inTx((t) => reserveSlotForReservation(freeSlot.slot_id, t));
  await inTx((t) => occupySlotForReservation(freeSlot.slot_id, t)); // bậc 1: reserved → occupied
  check("occupy slot đang reserved → occupied (bậc 1)", (await ParkingSlot.findByPk(freeSlot.slot_id)).status === 'occupied');
  const reOccupy = await grab(() => inTx((t) => occupySlotForReservation(freeSlot.slot_id, t)));
  check("occupy slot đang occupied → SLOT_BUSY", reOccupy.ok === false && reOccupy.code === 'SLOT_BUSY');
  await ParkingSlot.update({ status: 'available' }, { where: { slot_id: freeSlot.slot_id } });

  console.log('=== B. EDGE: materializeReservationSlot guard (chỉ confirmed + trong ca + chưa có slot) ===');
  const inShift = { startMs: -0.5 * H, endMs: 3 * H };
  const confInShift = await makeResv({ base, status: 'confirmed', ...inShift });
  check('confirmed + trong ca → locked=true', (await materializeReservationSlot(confInShift.reservation_id)).locked === true);
  const cis = await Reservation.findByPk(confInShift.reservation_id);
  if (cis.slot_id) created.slots.add(cis.slot_id);

  const future = await makeResv({ base, status: 'confirmed', startMs: 2 * H, endMs: 5 * H });
  check('confirmed CHƯA tới ca (start>now) → locked=false', (await materializeReservationSlot(future.reservation_id)).locked === false);
  check('  → đơn chưa tới ca vẫn slot_id null', (await Reservation.findByPk(future.reservation_id)).slot_id === null);

  const ended = await makeResv({ base, status: 'confirmed', startMs: -5 * H, endMs: -1 * H });
  check('confirmed ĐÃ hết ca (end<=now) → locked=false', (await materializeReservationSlot(ended.reservation_id)).locked === false);

  const pend = await makeResv({ base, status: 'pending', ...inShift });
  check('pending (chưa trả tiền) trong ca → locked=false', (await materializeReservationSlot(pend.reservation_id)).locked === false);

  const already = await makeResv({ base, status: 'confirmed', ...inShift, slotId: freeSlot.slot_id });
  check('confirmed ĐÃ có slot_id → locked=false (idempotent)', (await materializeReservationSlot(already.reservation_id)).locked === false);
  await ParkingSlot.update({ status: 'available' }, { where: { slot_id: freeSlot.slot_id } });

  console.log('=== B2. EDGE: check-in TRƯỚC start_time → 409 (ân hạn vào sớm đã bỏ = 0) ===');
  const early = await makeResv({ base, status: 'confirmed', startMs: 5 * 60 * 1000, endMs: 4 * H });
  const earlyCi = await grab(() => checkinReservation(STAFF_ID, { reservationId: early.reservation_id }));
  check('check-in sớm 5 phút bị chặn 409 (không còn du di 15\')', earlyCi.ok === false && earlyCi.status === 409, JSON.stringify(earlyCi));
  check('đơn vẫn confirmed (không bị check-in sớm)', (await Reservation.findByPk(early.reservation_id)).status === 'confirmed');

  console.log('=== C. EDGE: holdback — đơn ĐÃ materialize không giữ chỗ walk-in; CHƯA materialize thì có ===');
  // Dọn mọi đơn edge đã tạo ở F2 để holdback về nền sạch, rồi dựng kịch bản kiểm soát freeOnFloor.
  await Reservation.update({ status: 'cancelled', slot_id: null }, { where: { reservation_id: { [Op.in]: created.reservations } } });
  await ParkingSlot.update({ status: 'available' }, { where: { slot_id: { [Op.in]: [...created.slots] } } });
  // Để lại đúng 2 slot trống trên F2.
  const free0 = await freeCount(zoneIds);
  await occupyN(zoneIds, base.vehicleTypeId, free0 - 2);
  check('đã set freeOnFloor = 2', (await freeCount(zoneIds)) === 2, `free=${await freeCount(zoneIds)}`);
  const dummySlot = await ParkingSlot.findOne({ where: { zone_id: zone.zone_id, status: 'available' } });

  // (c1) 1 đơn ĐÃ materialize (start+1h, đã giữ slot) → holdback phải BỎ QUA nó.
  const matResv = await makeResv({ base, status: 'confirmed', startMs: 1 * H, endMs: 4 * H });
  await materializeReservationSlot(matResv.reservation_id); // giữ 1 trong 2 slot → free còn 1
  const matR = await Reservation.findByPk(matResv.reservation_id);
  if (matR.slot_id) created.slots.add(matR.slot_id);
  const afterMat = await filterWalkInCandidatesForUpcomingReservations([dummySlot], base);
  check('đơn đã materialize KHÔNG chặn walk-in (holdback bỏ qua)', afterMat.length === 1, `free=${await freeCount(zoneIds)}`);

  // (c2) THÊM 1 đơn CHƯA materialize (start+1h) → holdback=1, freeOnFloor=1 → chặn walk-in.
  await makeResv({ base, status: 'confirmed', startMs: 1 * H, endMs: 4 * H });
  const afterUnmat = await filterWalkInCandidatesForUpcomingReservations([dummySlot], base);
  check('đơn CHƯA materialize CÓ giữ chỗ (freeOnFloor=holdback → chặn)', afterUnmat.length === 0, `free=${await freeCount(zoneIds)}`);

  console.log('=== D. EDGE: check-in bậc 1 — slot đã khóa bị CHIẾM MẤT → tụt bậc 2 (slot khác cùng tầng) ===');
  // Dọn F2, để nhiều slot trống.
  await Reservation.update({ status: 'cancelled', slot_id: null }, { where: { reservation_id: { [Op.in]: created.reservations } } });
  await ParkingSession.destroy({ where: { session_id: { [Op.in]: created.sessions } } });
  await ParkingSlot.update({ status: 'available' }, { where: { slot_id: { [Op.in]: [...created.slots] } } });
  created.sessions.length = 0; created.slots.clear();
  const dResv = await makeResv({ base, status: 'confirmed', startMs: -0.5 * H, endMs: 3 * H });
  await materializeReservationSlot(dResv.reservation_id);
  const dR = await Reservation.findByPk(dResv.reservation_id);
  const stolenSlotId = dR.slot_id;
  created.slots.add(stolenSlotId);
  check('đơn đã khóa slot', stolenSlotId != null);
  // "Cướp" slot đó: ép sang occupied (mô phỏng ai đó chiếm mất giữa chừng).
  await ParkingSlot.update({ status: 'occupied' }, { where: { slot_id: stolenSlotId } });
  const dci = await grab(() => checkinReservation(STAFF_ID, { reservationId: dResv.reservation_id }));
  check('check-in vẫn THÀNH CÔNG (tụt xuống bậc 2)', dci.ok === true, JSON.stringify(dci));
  if (dci.ok) {
    created.sessions.push(dci.value.session.session_id);
    created.slots.add(dci.value.session.slot_id);
    check('gán slot KHÁC slot bị cướp', dci.value.session.slot_id !== stolenSlotId);
    check('vẫn cùng tầng (floorReassigned=false)', dci.value.floorReassigned === false);
  }
  await ParkingSlot.update({ status: 'available' }, { where: { slot_id: stolenSlotId } });

  console.log('=== E. LIMIT: capacity available KẸP ở 0 (không âm) khi supply < booked ===');
  await Reservation.update({ status: 'cancelled', slot_id: null }, { where: { reservation_id: { [Op.in]: created.reservations } } });
  await ParkingSession.destroy({ where: { session_id: { [Op.in]: created.sessions } } });
  await ParkingSlot.update({ status: 'available' }, { where: { slot_id: { [Op.in]: [...created.slots] } } });
  created.sessions.length = 0; created.slots.clear();
  // Chiếm HẾT slot F2 (supply=0) + 1 đơn overlap (booked>=1) → supply - booked < 0.
  const allFree = await freeCount(zoneIds);
  await occupyN(zoneIds, base.vehicleTypeId, allFree);
  const win = { startTime: new Date(Date.now() - 0.5 * H), endTime: new Date(Date.now() + 3 * H) };
  await makeResv({ base, status: 'confirmed', startMs: -0.5 * H, endMs: 3 * H });
  const cap = await getReservationWindowCapacity({ ...base, ...win });
  check('supply < booked nhưng available = 0 (không âm)', cap.available === 0, `supply=${cap.supply} booked=${cap.booked} avail=${cap.available}`);

  console.log(`\n==== KẾT QUẢ: ${pass} PASS / ${fail} FAIL ====`);
  return fail === 0;
};

const cleanup = async () => {
  await Payment.destroy({ where: { reservation_id: { [Op.in]: created.reservations } } }).catch(() => {});
  await RefundRequest.destroy({ where: { reservation_id: { [Op.in]: created.reservations } } }).catch(() => {});
  await ParkingSession.destroy({ where: { session_id: { [Op.in]: created.sessions } } }).catch(() => {});
  await Reservation.destroy({ where: { reservation_id: { [Op.in]: created.reservations } } }).catch(() => {});
  await Reservation.destroy({ where: { qr_token: { [Op.like]: `${TAG}-%` } } }).catch(() => {});
  if (created.slots.size) {
    await ParkingSlot.update({ status: 'available' }, { where: { slot_id: { [Op.in]: [...created.slots] } } }).catch(() => {});
  }
};

run()
  .then(async (ok) => { await cleanup(); process.exit(ok ? 0 : 1); })
  .catch(async (err) => { console.error('Test crash:', err); await cleanup().catch(() => {}); process.exit(1); });
