// Acceptance test — LỐ GIỜ ĐẶT CHỖ: xe ra sau end_time của đơn → thu phụ thu (như walk-in lố giờ),
// ngưỡng là end_time của TỪNG ĐƠN chứ không phải max_parking_hours. KHÔNG ân hạn (grace=0).
// Gọi thẳng service, không PayOS. Tự dọn dữ liệu.
// Chạy: node scripts/testReservationOverstay.js
import 'dotenv/config';
import sequelize from '../src/config/db.js';
import { Reservation, ParkingSession, ParkingSlot, Gate } from '../src/models/index.js';
import { previewCheckoutFee } from '../src/services/session.service.js';
import { getOverstayFee } from '../src/utils/settings.js';

const USER_ID = 4;
let pass = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  PASS: ${name}`); }
  else { fail += 1; console.log(`  FAIL: ${name} ${extra}`); }
};

const cleanup = { sessions: [], reservations: [] };
const H = 3600 * 1000;

// Đơn đã check-in + phiên đang gửi. endInMs < 0 = khung giờ đã kết thúc cách đây |endInMs|.
const makeParkedReservation = async ({ endInMs }) => {
  const slot = await ParkingSlot.findOne({
    where: { status: 'available' },
    include: [{ association: 'zone' }],
  });
  if (!slot) throw new Error('Hết slot available — seed lại DB');

  const end = new Date(Date.now() + endInMs);
  const start = new Date(end.getTime() - 4 * H);
  const resv = await Reservation.create({
    user_id: USER_ID,
    vehicle_type_id: slot.zone.vehicle_type_id,
    floor_id: slot.zone.floor_id,
    zone_id: slot.zone_id,
    slot_id: slot.slot_id,
    plate_number: '95A-00001',
    start_time: start,
    end_time: end,
    status: 'checked_in',
    reservation_type: 'standard',
    qr_token: `test-over-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  });
  cleanup.reservations.push(resv.reservation_id);

  const gate = await Gate.findOne({ where: { direction: 'in', is_active: true } });
  const session = await ParkingSession.create({
    user_id: USER_ID,
    reservation_id: resv.reservation_id,
    slot_id: slot.slot_id,
    vehicle_type_id: slot.zone.vehicle_type_id,
    plate_number: resv.plate_number,
    time_in: start,
    status: 'active',
    session_type: 'reservation',
    gate_stage: 'on_floor',
    gate_id: gate.gate_id,
    check_in_by: USER_ID,
    qr_token: `test-sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  });
  cleanup.sessions.push(session.session_id);
  await slot.update({ status: 'occupied' });
  return { resv, session, slot };
};

const run = async () => {
  const OVERSTAY_FEE = getOverstayFee();
  console.log(`(overstay_fee hiện hành = ${OVERSTAY_FEE}đ)\n`);

  console.log('=== TEST 1: Còn trong khung giờ đã đặt → KHÔNG lố giờ, không phụ thu ===');
  const a = await makeParkedReservation({ endInMs: 2 * H }); // còn 2 tiếng nữa mới hết khung
  const p1 = await previewCheckoutFee({ sessionId: a.session.session_id });
  check('overstay = false', p1.overstay === false, JSON.stringify({ overstay: p1.overstay, reason: p1.overstayReason }));
  check('không cộng phụ thu', p1.overstayFee === 0);

  console.log('=== TEST 2: Quá end_time dù chỉ ít phút → LỐ NGAY (ân hạn = 0) ===');
  const b = await makeParkedReservation({ endInMs: -10 * 60 * 1000 }); // quá 10 phút
  const p2 = await previewCheckoutFee({ sessionId: b.session.session_id });
  check('overstay = true (không còn ân hạn)', p2.overstay === true, JSON.stringify({ overstay: p2.overstay }));
  check('cộng phụ thu = overstay_fee (phẳng, không theo giờ)', p2.overstayFee === OVERSTAY_FEE, `(được ${p2.overstayFee})`);

  console.log('=== TEST 3: Quá end_time 3 tiếng → LỐ GIỜ, thu phụ thu, BẮT BUỘC ===');
  const c = await makeParkedReservation({ endInMs: -3 * H });
  const p3 = await previewCheckoutFee({ sessionId: c.session.session_id });
  check('overstay = true', p3.overstay === true, JSON.stringify(p3.overstayReason));
  check("overstayReason = 'reservation_window'", p3.overstayReason === 'reservation_window');
  check('overstayHours = 3 (tính từ end_time)', p3.overstayHours === 3, `(được ${p3.overstayHours})`);
  check('overstayEnforced = true (staff KHÔNG bỏ được)', p3.overstayEnforced === true);
  check('phụ thu = overstay_fee', p3.overstayFee === OVERSTAY_FEE, `(được ${p3.overstayFee})`);

  console.log('=== TEST 4: Staff cố tình KHÔNG tick → vẫn bị thu (enforce server-side) ===');
  const p4 = await previewCheckoutFee({ sessionId: c.session.session_id, overstayCharge: false });
  check('vẫn cộng phụ thu dù staff bỏ tick', p4.overstayCharge === true && p4.overstayFee === OVERSTAY_FEE);

  console.log('=== TEST 5: Phí ra = phí gửi xe + phụ thu (không nuốt mất phần giờ) ===');
  const p5 = await previewCheckoutFee({ sessionId: c.session.session_id });
  const feeKhongPhuThu = p5.fee - p5.overstayFee;
  check('tổng phí = phí giờ + phụ thu', p5.fee === feeKhongPhuThu + OVERSTAY_FEE);
  check('phí giờ > 0 (vẫn tính tiền theo thời gian đỗ)', feeKhongPhuThu > 0, `(${feeKhongPhuThu})`);

  console.log('=== TEST 6: Tra bằng QR ĐẶT CHỖ cũng ra đúng kết quả (staff hay quét mã này) ===');
  const p6 = await previewCheckoutFee({ qrToken: c.resv.qr_token });
  check('vẫn phát hiện lố giờ qua QR đơn', p6.overstay === true && p6.overstayReason === 'reservation_window');
};

try {
  await run();
} catch (err) {
  fail += 1;
  console.log('LỖI NGOÀI DỰ KIẾN:', err.message);
} finally {
  for (const id of cleanup.sessions) {
    const s = await ParkingSession.findByPk(id);
    if (s?.slot_id) await ParkingSlot.update({ status: 'available' }, { where: { slot_id: s.slot_id } });
    await ParkingSession.destroy({ where: { session_id: id } });
  }
  for (const id of cleanup.reservations) await Reservation.destroy({ where: { reservation_id: id } });
  console.log(`\n=== KẾT QUẢ: ${pass} PASS / ${fail} FAIL ===`);
  await sequelize.close();
  process.exit(fail ? 1 : 0);
}
