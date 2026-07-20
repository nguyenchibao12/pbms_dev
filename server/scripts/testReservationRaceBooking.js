// Acceptance test — ĐUA ĐẶT CHỖ (2 user giành suất cuối cùng cùng khung giờ).
// Mô hình sức chứa: "cùng một chỗ" = SUẤT cuối của (tầng, loại xe) trong khung. Zone FOR UPDATE
// (câu lệnh đầu txn) phải serialize 2 request → CHỈ 1 lọt cổng, 1 bị 409 NO_SLOT_FOR_WINDOW.
// Nếu KHÔNG serialize thì cả 2 cùng đọc available=1 → cùng lọt → OVERSELL.
// PayOS tắt: request lọt cổng sẽ chết ở PayOS (502) → dễ phân biệt winner/loser.
// Chạy: node scripts/testReservationRaceBooking.js
import 'dotenv/config';
delete process.env.PAYOS_CLIENT_ID;

import { Op } from 'sequelize';
import {
  Reservation,
  ParkingSession,
  ParkingSlot,
  Payment,
  Gate,
  UserAccount,
} from '../src/models/index.js';
import { createReservation } from '../src/services/reservation.service.js';
import { getReservationWindowCapacity } from '../src/utils/reservationCapacity.js';
import { normalizePlateVN } from '../src/utils/plateVN.js';

const USER_ID = 4;
const STAFF_ID = 3;
let pass = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  PASS: ${name}`); }
  else { fail += 1; console.log(`  FAIL: ${name} ${extra}`); }
};
const settle = async (fn) => {
  try { return { ok: true, value: await fn() }; }
  catch (err) { return { ok: false, code: err.code, status: err.statusCode }; }
};

const pad = (n) => String(n).padStart(2, '0');
const created = { reservations: [], sessions: [], slots: new Set() };

// Lấp N slot available của (tầng, loại xe) bằng session walk-in giả → giảm supply đi N.
const fillN = async (zoneIds, vehicleTypeId, n) => {
  if (n <= 0) return 0;
  const slots = await ParkingSlot.findAll({
    where: { zone_id: { [Op.in]: zoneIds }, status: 'available' },
    limit: n,
  });
  const gate = await Gate.findOne({ where: { direction: 'in', is_active: true } });
  for (const slot of slots) {
    await slot.update({ status: 'occupied' });
    const s = await ParkingSession.create({
      user_id: null, gate_id: gate.gate_id, slot_id: slot.slot_id,
      vehicle_type_id: vehicleTypeId, plate_number: normalizePlateVN(`52F-${10000 + (slot.slot_id % 89999)}`),
      time_in: new Date(Date.now() - 3600 * 1000), gate_stage: 'on_floor',
      qr_token: `race-fill-${slot.slot_id}-${Date.now()}`, check_in_by: STAFF_ID,
      session_type: 'walk_in', status: 'active',
    });
    created.sessions.push(s.session_id);
    created.slots.add(slot.slot_id);
  }
  return slots.length;
};

const run = async () => {
  const slot = await ParkingSlot.findOne({
    where: { status: 'available' },
    include: [{ association: 'zone', where: { vehicle_type_id: 1 } }],
    order: [['slot_id', 'ASC']],
  });
  if (!slot) throw new Error('Hết slot CAR — seed lại DB');
  const base = { floorId: slot.zone.floor_id, vehicleTypeId: slot.zone.vehicle_type_id };

  // Khung +2 ngày, ca chiều 12:00–18:00 (không trùng đơn seed +2 sáng).
  const d = new Date(); d.setDate(d.getDate() + 2);
  const arrivalDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const startTime = new Date(d); startTime.setHours(12, 0, 0, 0);
  const endTime = new Date(d); endTime.setHours(18, 0, 0, 0);

  const cap0 = await getReservationWindowCapacity({ ...base, startTime, endTime });
  console.log(`  (khung +2 ngày ca chiều: available ban đầu = ${cap0.available})`);
  // Ép available về ĐÚNG 1 (chỉ còn 1 suất cuối).
  await fillN(cap0.zoneIds, base.vehicleTypeId, cap0.available - 1);
  const cap1 = await getReservationWindowCapacity({ ...base, startTime, endTime });
  check('đã ép còn ĐÚNG 1 suất cuối trong khung', cap1.available === 1, `available=${cap1.available}`);

  const user2 = await UserAccount.findOne({ where: { username: 'user2' } });
  const uid2 = user2 ? user2.user_id : USER_ID;

  console.log('=== TEST 1: 2 user đặt SUẤT CUỐI cùng khung → đúng 1 lọt, 1 bị 409 NO_SLOT_FOR_WINDOW ===');
  const bookA = { plateNumber: '96A-11111', vehicleTypeId: base.vehicleTypeId, floorId: base.floorId, shiftId: 'afternoon', arrivalDate };
  const bookB = { plateNumber: '96A-22222', vehicleTypeId: base.vehicleTypeId, floorId: base.floorId, shiftId: 'afternoon', arrivalDate };
  const [rA, rB] = await Promise.all([
    settle(() => createReservation(USER_ID, bookA)),
    settle(() => createReservation(uid2, bookB)),
  ]);
  const outcomes = [rA, rB];
  const rejected = outcomes.filter((r) => !r.ok && r.code === 'NO_SLOT_FOR_WINDOW');
  const passedGate = outcomes.filter((r) => r.ok || r.code === 'PAYMENT_GATEWAY_ERROR');
  console.log(`  A: ${JSON.stringify(rA.ok ? 'OK' : rA.code)} | B: ${JSON.stringify(rB.ok ? 'OK' : rB.code)}`);
  check('ĐÚNG 1 request bị chặn 409 NO_SLOT_FOR_WINDOW (không oversell)', rejected.length === 1, `rejected=${rejected.length}`);
  check('ĐÚNG 1 request lọt cổng (rồi chết ở PayOS 502)', passedGate.length === 1, `passed=${passedGate.length}`);

  // Không oversell: số đơn pending/confirmed trùng khung do 2 request tạo ≤ 1.
  const overlapCount = await Reservation.count({
    where: {
      floor_id: base.floorId, vehicle_type_id: base.vehicleTypeId,
      plate_number: { [Op.in]: [normalizePlateVN('96A-11111'), normalizePlateVN('96A-22222')] },
      status: { [Op.in]: ['pending', 'confirmed'] },
      start_time: { [Op.lt]: endTime }, end_time: { [Op.gt]: startTime },
    },
  });
  check('không còn đơn pending/confirmed nào oversell (winner đã bị PayOS hủy)', overlapCount === 0, `count=${overlapCount}`);
  // dọn mọi đơn 2 biển test tạo ra (kể cả cancelled)
  const madeRes = await Reservation.findAll({
    where: { plate_number: { [Op.in]: [normalizePlateVN('96A-11111'), normalizePlateVN('96A-22222')] } },
    attributes: ['reservation_id'],
  });
  created.reservations.push(...madeRes.map((r) => r.reservation_id));

  // GHI CHÚ: đua CÙNG BIỂN (2 đơn cùng 1 xe) do re-check trùng biển TRONG txn chặn — nhưng test
  // đó không xác định được khi tắt PayOS (winner tự hủy tức thì sau commit nên request 2 re-check
  // có thể thấy đơn đã 'cancelled'). Trên production winner ở 'pending' đủ lâu (PayOS là call
  // mạng thật) nên request 2 luôn thấy → CONFLICT. Ca tuần tự (deterministic) đã phủ ở
  // testReservationCapacity TEST 3.

  console.log(`\n==== KẾT QUẢ: ${pass} PASS / ${fail} FAIL ====`);
  return fail === 0;
};

const cleanup = async () => {
  await Payment.destroy({ where: { reservation_id: { [Op.in]: created.reservations } } }).catch(() => {});
  await Reservation.destroy({ where: { reservation_id: { [Op.in]: created.reservations } } }).catch(() => {});
  await ParkingSession.destroy({ where: { session_id: { [Op.in]: created.sessions } } }).catch(() => {});
  if (created.slots.size) {
    await ParkingSlot.update({ status: 'available' }, { where: { slot_id: { [Op.in]: [...created.slots] } } }).catch(() => {});
  }
};

run()
  .then(async (ok) => { await cleanup(); process.exit(ok ? 0 : 1); })
  .catch(async (err) => { console.error('Test crash:', err); await cleanup().catch(() => {}); process.exit(1); });
