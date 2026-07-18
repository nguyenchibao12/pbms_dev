// Acceptance test — SLOT THEO KHUNG GIỜ (3 luật chủ module 18/07):
//   Luật 1 (JIT): cờ 'reserved' KHÔNG bật lúc tạo đơn — chỉ kích trước giờ vào
//                 SLOT_LOCK_LEAD_MS (≈1 ca) qua job/sync; hủy đơn thì tự nhả.
//   Luật 2: người đặt khác chỉ bị chặn ở khung CHỒNG LẤN — slot có đơn ca khác vẫn đặt được.
//   Luật 3: check-in đơn mà slot bị chiếm (xe lố giờ/walk-in) → tự gán slot khác + incident.
// Kịch bản §2 của báo cáo FE (BAO_CAO_BE_KHOA_SLOT_THEO_THOI_GIAN) phải ĐẢO kết quả.
// Gọi thẳng service. Tự dọn dữ liệu. Chạy: node scripts/testSlotWindowJit.js
import 'dotenv/config';
delete process.env.PAYOS_CLIENT_ID; // không luồng nào trong test được chạm PayOS thật

import { Op } from 'sequelize';
import {
  Reservation,
  ParkingSession,
  ParkingSlot,
  Gate,
  Incident,
  Payment,
} from '../src/models/index.js';
import {
  getWindowAvailability,
  cancelUserReservation,
  checkinReservation,
} from '../src/services/reservation.service.js';
import { suggestSlot } from '../src/utils/slotSuggest.js';
import { runReservationMaintenance } from '../src/jobs/reservationMaintenance.job.js';
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

const PLATES = ['94B-11111', '94B-22222', '94B-33333', '94B-44444'].map(normalizePlateVN);
const cleanupIds = { reservations: [], sessions: [], slots: new Set() };

const makeReservation = async ({ slot, plate, startMs, endMs, status = 'confirmed', userId = USER_ID }) => {
  const r = await Reservation.create({
    user_id: userId,
    vehicle_type_id: slot.zone.vehicle_type_id,
    floor_id: slot.zone.floor_id,
    zone_id: slot.zone_id,
    slot_id: slot.slot_id,
    plate_number: plate,
    start_time: new Date(Date.now() + startMs),
    end_time: new Date(Date.now() + endMs),
    status,
    reservation_type: 'standard',
    qr_token: `jit-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  });
  cleanupIds.reservations.push(r.reservation_id);
  cleanupIds.slots.add(slot.slot_id);
  return r;
};

const makeSquatterSession = async (slot, plate) => {
  await ParkingSlot.update({ status: 'occupied' }, { where: { slot_id: slot.slot_id } });
  const gate = await Gate.findOne({ where: { direction: 'in', is_active: true } });
  const s = await ParkingSession.create({
    user_id: null,
    gate_id: gate.gate_id,
    slot_id: slot.slot_id,
    vehicle_type_id: slot.zone.vehicle_type_id,
    plate_number: plate,
    time_in: new Date(Date.now() - 3 * H),
    gate_stage: 'on_floor',
    qr_token: `jit-squat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    check_in_by: STAFF_ID,
    session_type: 'walk_in',
    status: 'active',
  });
  cleanupIds.sessions.push(s.session_id);
  cleanupIds.slots.add(slot.slot_id);
  return s;
};

const slotStatus = async (slotId) => (await ParkingSlot.findByPk(slotId)).status;

const run = async () => {
  // Zone có >= 3 slot trống để đủ chỗ cho rescue.
  const freeSlots = await ParkingSlot.findAll({
    where: { status: 'available' },
    include: [{ association: 'zone' }],
  });
  const byZone = new Map();
  for (const s of freeSlots) {
    if (!byZone.has(s.zone_id)) byZone.set(s.zone_id, []);
    byZone.get(s.zone_id).push(s);
  }
  const zoneSlots = [...byZone.values()].find((arr) => arr.length >= 3);
  if (!zoneSlots) throw new Error('Cần zone có >= 3 slot trống — seed lại DB');
  const [S1, , S3] = zoneSlots;
  const base = { floorId: S1.zone.floor_id, vehicleTypeId: S1.zone.vehicle_type_id, zoneId: S1.zone_id };

  // 3 cửa sổ: A = mai 13-18 (đơn R1), B = mai sáng (không chồng A), C = ngày mốt.
  const W_A = { startTime: new Date(Date.now() + 24 * H).toISOString(), endTime: new Date(Date.now() + 29 * H).toISOString() };
  const W_B = { startTime: new Date(Date.now() + 16 * H).toISOString(), endTime: new Date(Date.now() + 21 * H).toISOString() };
  const W_C = { startTime: new Date(Date.now() + 48 * H).toISOString(), endTime: new Date(Date.now() + 53 * H).toISOString() };

  const before = {};
  for (const [k, w] of Object.entries({ A: W_A, B: W_B, C: W_C })) {
    before[k] = (await getWindowAvailability({ ...base, ...w })).availableCount;
  }

  console.log('=== SETUP: R1 confirmed MAI 13-18 trên slot S1 (mô hình mới: KHÔNG bật cờ) ===');
  await makeReservation({ slot: S1, plate: PLATES[0], startMs: 24 * H, endMs: 29 * H });

  console.log('=== LUẬT 1: tạo đơn tương lai KHÔNG khóa slot ngay ===');
  check('S1 vẫn available (trước fix: reserved ngay lập tức)', (await slotStatus(S1.slot_id)) === 'available');

  console.log('=== LUẬT 2 (FE §2a/b đảo kết quả): chỉ khung chồng lấn mất chỗ ===');
  const after = {};
  for (const [k, w] of Object.entries({ A: W_A, B: W_B, C: W_C })) {
    after[k] = (await getWindowAvailability({ ...base, ...w })).availableCount;
  }
  check(`khung TRÙNG (mai 13-18) mất đúng 1 chỗ (${before.A}→${after.A})`, after.A === before.A - 1);
  check(`khung KHÔNG trùng (mai sáng) giữ nguyên (${before.B}→${after.B})`, after.B === before.B);
  check(`ngày mốt giữ nguyên (${before.C}→${after.C})`, after.C === before.C);

  const sugOverlap = await grab(() => suggestSlot({ ...base, ...W_A }));
  const overlapHasS1 = sugOverlap.ok && sugOverlap.value.rankedSlots.some((s) => s.slot_id === S1.slot_id);
  check('suggest khung trùng KHÔNG chứa S1', !overlapHasS1);
  const sugFree = await grab(() => suggestSlot({ ...base, ...W_B }));
  const freeHasS1 = sugFree.ok && sugFree.value.rankedSlots.some((s) => s.slot_id === S1.slot_id);
  check('suggest khung không trùng CÓ chứa S1', freeHasS1, JSON.stringify(sugFree.ok ? '' : sugFree));

  console.log('=== LUẬT 1 (JIT kích): đơn bắt đầu trong lead → job bật cờ ===');
  const S2 = zoneSlots[1];
  const r2 = await makeReservation({ slot: S2, plate: PLATES[1], startMs: 0.5 * H, endMs: 4.5 * H });
  await runReservationMaintenance();
  check('S2 chuyển reserved sau lượt quét job', (await slotStatus(S2.slot_id)) === 'reserved');

  console.log('=== LUẬT 1 (JIT nhả): hủy đơn → cờ tự nhả ===');
  await cancelUserReservation(USER_ID, r2.reservation_id);
  check('S2 trả về available ngay khi hủy', (await slotStatus(S2.slot_id)) === 'available');

  console.log('=== LUẬT 3 (rescue): slot bị walk-in chiếm lúc check-in đơn → tự gán slot khác ===');
  const r3 = await makeReservation({ slot: S3, plate: PLATES[2], startMs: -0.5 * H, endMs: 2 * H });
  const squatter = await makeSquatterSession(S3, PLATES[3]);
  const ci = await grab(() => checkinReservation(STAFF_ID, { reservationId: r3.reservation_id }));
  check('check-in THÀNH CÔNG dù slot bị chiếm', ci.ok === true, JSON.stringify(ci));
  if (ci.ok) {
    cleanupIds.sessions.push(ci.value.session.session_id);
    cleanupIds.slots.add(ci.value.session.slot_id);
    check('kết quả báo slotReassigned', ci.value.slotReassigned === true);
    check('đơn được gán slot MỚI (khác S3)', ci.value.reservation.slot_id !== S3.slot_id);
    check('slot mới cùng zone (ưu tiên gần chỗ cũ)', ci.value.reservation.zone_id === S3.zone_id);
    const squatterNow = await ParkingSession.findByPk(squatter.session_id);
    check('xe chiếm chỗ KHÔNG bị đụng (vẫn active, sẽ bị thu phụ thu lúc ra)', squatterNow.status === 'active');
    const incident = await Incident.findOne({
      where: { reservation_id: r3.reservation_id, type: 'overstay' },
      order: [['incident_id', 'DESC']],
    });
    check('incident overstay ghi lại vụ chiếm chỗ', Boolean(incident), 'không thấy incident');
  }

  console.log(`\n==== KẾT QUẢ: ${pass} PASS / ${fail} FAIL ====`);
  return fail === 0;
};

const cleanup = async () => {
  await Incident.destroy({ where: { reservation_id: { [Op.in]: cleanupIds.reservations } } });
  await ParkingSession.destroy({ where: { session_id: { [Op.in]: cleanupIds.sessions } } });
  await Payment.destroy({ where: { reservation_id: { [Op.in]: cleanupIds.reservations } } });
  await Reservation.destroy({ where: { reservation_id: { [Op.in]: cleanupIds.reservations } } });
  if (cleanupIds.slots.size) {
    await ParkingSlot.update(
      { status: 'available' },
      { where: { slot_id: { [Op.in]: [...cleanupIds.slots] } } },
    );
  }
};

run()
  .then(async (ok) => { await cleanup(); process.exit(ok ? 0 : 1); })
  .catch(async (err) => {
    console.error('Test crash:', err);
    await cleanup().catch(() => {});
    process.exit(1);
  });
