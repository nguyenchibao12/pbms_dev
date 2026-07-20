// Acceptance test — cặp lỗi B2 + B1 (phải fix cùng nhau):
//   B2: walk-in bị chặn oan khi xe có đơn confirmed ở TƯƠNG LAI XA.
//   B1: hủy đơn tương lai void nhầm phiên walk-in ĐANG GỬI cùng biển số (chỉ chạm tới được
//       sau khi mở B2 — nên hai lỗi đi chung một bản vá).
// Kèm chốt chống né phí: check-in đơn không được void phiên walk-in đã đỗ lâu (mất trắng phí).
// Gọi thẳng service. Tự dọn dữ liệu. Chạy: node scripts/testWalkinReservationB1B2.js
import 'dotenv/config';
import sequelize from '../src/config/db.js';
import { Reservation, ParkingSession, ParkingSlot, Payment, Gate, RefundRequest } from '../src/models/index.js';
import { checkin } from '../src/services/session.service.js';
import { cancelUserReservation, checkinReservation } from '../src/services/reservation.service.js';
import { normalizePlateVN } from '../src/utils/plateVN.js';

const USER_ID = 4;  // seed: user
const STAFF_ID = 3; // seed: staff
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

const H = 3600 * 1000;
const cleanup = { reservations: [], sessions: [], slots: [] };

const findFreeSlot = async () => {
  const slot = await ParkingSlot.findOne({
    where: { status: 'available' },
    include: [{ association: 'zone' }],
  });
  if (!slot) throw new Error('Hết slot available — seed lại DB');
  return slot;
};

// Đơn confirmed — mô hình SUẤT (migration 008): KHÔNG ghim slot, chỉ giữ zone ưu tiên.
// findFreeSlot chỉ để LẤY zone info (floor/vt) cho test đọc, không pin/không đổi status.
const makeConfirmed = async ({ plate, startInMs }) => {
  const slot = await findFreeSlot();
  const start = new Date(Date.now() + startInMs);
  const r = await Reservation.create({
    user_id: USER_ID,
    vehicle_type_id: slot.zone.vehicle_type_id,
    floor_id: slot.zone.floor_id,
    zone_id: slot.zone_id,
    slot_id: null,
    plate_number: normalizePlateVN(plate), // luồng thật luôn chuẩn hóa biển trước khi lưu
    start_time: start,
    end_time: new Date(start.getTime() + 4 * H),
    status: 'confirmed',
    reservation_type: 'standard',
    qr_token: `test-b1b2-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  });
  cleanup.reservations.push(r.reservation_id);
  await Payment.create({
    reservation_id: r.reservation_id,
    order_code: Math.floor(Date.now() / 1000) * 1000 + Math.floor(Math.random() * 999),
    amount: 20000, status: 'success', method: 'payos', paid_at: new Date(),
  });
  return { r, slot };
};

// Phiên walk-in dựng thẳng DB với time_in tùy ý (để test tuổi phiên).
const makeWalkinSession = async ({ plate, ageMs }) => {
  const slot = await findFreeSlot();
  await slot.update({ status: 'occupied' });
  cleanup.slots.push(slot.slot_id);
  const gate = await Gate.findOne({ where: { direction: 'in', is_active: true } });
  const s = await ParkingSession.create({
    user_id: null,
    gate_id: gate.gate_id,
    slot_id: slot.slot_id,
    vehicle_type_id: slot.zone.vehicle_type_id,
    plate_number: normalizePlateVN(plate),
    time_in: new Date(Date.now() - ageMs),
    gate_stage: 'in_building',
    qr_token: `test-b1b2-sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    check_in_by: STAFF_ID,
    session_type: 'walk_in',
    status: 'active',
  });
  cleanup.sessions.push(s.session_id);
  return s;
};

const run = async () => {
  console.log('=== TEST 1 (B2): đơn confirmed NGÀY MAI → hôm nay walk-in phải ĐƯỢC ===');
  // 25h > holdback lead (6h) → đơn xa không giữ chỗ walk-in hôm nay. (Để >24h cho bền nếu lead đổi.)
  const t1 = await makeConfirmed({ plate: '94A-00001', startInMs: 25 * H });
  const w1 = await grab(() =>
    checkin(STAFF_ID, {
      plateNumber: '94A-00001',
      floorId: t1.slot.zone.floor_id,
      vehicleTypeId: t1.slot.zone.vehicle_type_id,
    }),
  );
  check('walk-in thành công (trước fix: 409 RESERVATION_NOT_OPEN)', w1.ok === true, JSON.stringify(w1));
  const w1Session = w1.ok ? w1.value : null;
  if (w1Session) {
    cleanup.sessions.push(w1Session.session_id);
    cleanup.slots.push(w1Session.slot_id);
    check("phiên là walk_in, KHÔNG dính vào đơn", w1Session.session_type === 'walk_in' && !w1Session.reservation_id);
  }

  console.log('=== TEST 2 (B2 vẫn chặn đúng chỗ): đơn bắt đầu trong 30 phút → walk-in bị hướng sang tab đặt chỗ ===');
  const t2 = await makeConfirmed({ plate: '94A-00002', startInMs: 30 * 60 * 1000 });
  const w2 = await grab(() =>
    checkin(STAFF_ID, {
      plateNumber: '94A-00002',
      floorId: t2.slot.zone.floor_id,
      vehicleTypeId: t2.slot.zone.vehicle_type_id,
    }),
  );
  if (w2.ok) { cleanup.sessions.push(w2.value.session_id); cleanup.slots.push(w2.value.slot_id); }
  check('409 RESERVATION_NOT_OPEN (khách đến sớm cho đơn)', w2.ok === false && w2.code === 'RESERVATION_NOT_OPEN', JSON.stringify(w2));

  console.log('=== TEST 3 (B1): xe ĐANG GỬI walk-in, hủy đơn ngày mai → phiên walk-in PHẢI SỐNG ===');
  // Chính là kịch bản TEST 1: xe 94A-00001 đang gửi walk-in + có đơn ngày mai. Giờ hủy đơn đó.
  const cancel = await grab(() => cancelUserReservation(USER_ID, t1.r.reservation_id));
  check('hủy đơn thành công', cancel.ok === true, JSON.stringify(cancel));
  if (w1Session) {
    const alive = await ParkingSession.findByPk(w1Session.session_id);
    check('phiên walk-in VẪN active (trước fix: bị void, xe kẹt trong bãi)', alive?.status === 'active', `(hiện: ${alive?.status})`);
  }
  const t1r = await Reservation.findByPk(t1.r.reservation_id);
  check("đơn đã 'cancelled'", t1r?.status === 'cancelled');

  console.log('=== TEST 4 (chống né phí): walk-in đã đỗ 3 TIẾNG + tới giờ đơn → check-in đơn phải BỊ CHẶN ===');
  const w4 = await makeWalkinSession({ plate: '94A-00004', ageMs: 3 * H });
  const t4 = await makeConfirmed({ plate: '94A-00004', startInMs: -1 * H }); // khung đơn ĐANG mở
  const c4 = await grab(() => checkinReservation(STAFF_ID, { reservationId: t4.r.reservation_id }));
  check('409 CONFLICT (không cho xóa sổ 3 tiếng phí walk-in)', c4.ok === false && c4.status === 409, JSON.stringify(c4));
  const w4Alive = await ParkingSession.findByPk(w4.session_id);
  check('phiên walk-in 3 tiếng VẪN active (chờ checkout thu tiền)', w4Alive?.status === 'active');

  console.log('=== TEST 5 (giữ đường staff sửa nhầm): walk-in mới 5 PHÚT → check-in đơn được, phiên nhầm bị void ===');
  const w5 = await makeWalkinSession({ plate: '94A-00005', ageMs: 5 * 60 * 1000 });
  const t5 = await makeConfirmed({ plate: '94A-00005', startInMs: -1 * H });
  const c5 = await grab(() => checkinReservation(STAFF_ID, { reservationId: t5.r.reservation_id }));
  check('check-in đơn thành công', c5.ok === true, JSON.stringify(c5));
  if (c5.ok) {
    cleanup.sessions.push(c5.value.session.session_id);
    cleanup.slots.push(c5.value.session.slot_id);
  }
  const w5After = await ParkingSession.findByPk(w5.session_id);
  check('phiên nhập nhầm đã bị void (không còn active)', w5After?.status !== 'active', `(hiện: ${w5After?.status})`);
};

try {
  await run();
} catch (err) {
  fail += 1;
  console.log('LỖI NGOÀI DỰ KIẾN:', err.message);
} finally {
  await RefundRequest.destroy({ where: { reservation_id: cleanup.reservations } }).catch(() => {});
  await Payment.destroy({ where: { reservation_id: cleanup.reservations } }).catch(() => {});
  for (const id of cleanup.sessions) await ParkingSession.destroy({ where: { session_id: id } }).catch(() => {});
  for (const id of cleanup.reservations) await Reservation.destroy({ where: { reservation_id: id } }).catch(() => {});
  for (const id of [...new Set(cleanup.slots)]) {
    await ParkingSlot.update({ status: 'available' }, { where: { slot_id: id } }).catch(() => {});
  }
  console.log(`\n=== KẾT QUẢ: ${pass} PASS / ${fail} FAIL ===`);
  await sequelize.close();
  process.exit(fail ? 1 : 0);
}
