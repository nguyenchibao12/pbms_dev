// Acceptance test — POST /reservations/:id/repay (trả tiếp phí giữ chỗ cho đơn pending).
// KHÔNG gọi PayOS thật (PayOS là tiền thật): gỡ PAYOS_CLIENT_ID khỏi process.env để mô phỏng
// gateway hỏng → kiểm các guard + hành vi khi gateway lỗi. Nhánh tạo link THẬT phải test tay
// qua Swagger/FE (xem phần cuối). Tự dọn dữ liệu.
// Chạy: node scripts/testReservationRepay.js
import 'dotenv/config';
import sequelize from '../src/config/db.js';
import { Reservation, Payment, ParkingSlot } from '../src/models/index.js';
import { repayReservation } from '../src/services/reservation.service.js';

const USER_ID = 4;        // seed: user thường
const OTHER_USER_ID = 1;  // seed: admin (đóng vai "người khác")
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

const cleanup = { reservations: [], payments: [] };

const makeReservation = async ({ status = 'pending', startInMs = 48 * 3600 * 1000, endInMs = null }) => {
  const slot = await ParkingSlot.findOne({
    where: { status: 'available' },
    include: [{ association: 'zone' }],
  });
  if (!slot) throw new Error('Không còn slot available — seed lại DB dev');
  const start = new Date(Date.now() + startInMs);
  const end = endInMs != null ? new Date(Date.now() + endInMs) : new Date(start.getTime() + 4 * 3600 * 1000);
  const r = await Reservation.create({
    user_id: USER_ID,
    vehicle_type_id: slot.zone.vehicle_type_id,
    floor_id: slot.zone.floor_id,
    zone_id: slot.zone_id,
    slot_id: slot.slot_id,
    plate_number: '96A-00001',
    start_time: start,
    end_time: end,
    status,
    reservation_type: 'standard',
    qr_token: `test-repay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  });
  cleanup.reservations.push(r.reservation_id);
  return r;
};

const makePendingPayment = async (reservationId, amount = 20000) => {
  const p = await Payment.create({
    reservation_id: reservationId,
    order_code: Math.floor(Date.now() / 1000) * 1000 + Math.floor(Math.random() * 999),
    amount,
    status: 'pending',
    method: 'payos',
    gateway_response: JSON.stringify({ checkoutUrl: 'https://pay.payos.vn/web/CU-CU-CU' }),
  });
  cleanup.payments.push(p.payment_id);
  return p;
};

const run = async () => {
  // Mô phỏng PayOS chết cho TOÀN BỘ test — không tiêu tiền thật, không tạo link thật.
  delete process.env.PAYOS_CLIENT_ID;

  console.log('=== TEST 1: Không phải đơn của mình → 403, KHÔNG đụng vào payment ===');
  const t1 = await makeReservation({});
  const p1 = await makePendingPayment(t1.reservation_id);
  const r1 = await grab(() => repayReservation(OTHER_USER_ID, t1.reservation_id));
  check('403 FORBIDDEN', r1.ok === false && r1.status === 403, JSON.stringify(r1));
  check('payment cũ KHÔNG bị đánh failed', (await p1.reload()).status === 'pending');

  console.log('=== TEST 2: Đơn không pending (đã confirmed) → 409, không tạo link ===');
  const t2 = await makeReservation({ status: 'confirmed' });
  const r2 = await grab(() => repayReservation(USER_ID, t2.reservation_id));
  check('409 CONFLICT', r2.ok === false && r2.status === 409, JSON.stringify(r2));
  check('message nêu trạng thái hiện tại', /confirmed/.test(r2.message || ''), r2.message);

  console.log('=== TEST 3: Khung giờ đã kết thúc → 409 (trả tiền lúc này là vô nghĩa) ===');
  const t3 = await makeReservation({ startInMs: -8 * 3600 * 1000, endInMs: -2 * 3600 * 1000 });
  await makePendingPayment(t3.reservation_id);
  const r3 = await grab(() => repayReservation(USER_ID, t3.reservation_id));
  check('409 CONFLICT', r3.ok === false && r3.status === 409, JSON.stringify(r3));
  check('message nói khung giờ đã kết thúc', /kết thúc/.test(r3.message || ''), r3.message);

  console.log('=== TEST 4: Đơn không tồn tại → 404 ===');
  const r4 = await grab(() => repayReservation(USER_ID, 99999999));
  check('404 NOT_FOUND', r4.ok === false && r4.status === 404);

  console.log('=== TEST 5: PayOS chết → 502, ĐƠN KHÔNG BỊ HỦY (khách bấm lại được) ===');
  const t5 = await makeReservation({});
  const p5 = await makePendingPayment(t5.reservation_id);
  const r5 = await grab(() => repayReservation(USER_ID, t5.reservation_id));
  check('502 PAYMENT_GATEWAY_ERROR', r5.ok === false && r5.status === 502, JSON.stringify(r5));
  await t5.reload();
  check('đơn VẪN pending (không bị hủy oan)', t5.status === 'pending', `(hiện: ${t5.status})`);
  const slot5 = await ParkingSlot.findByPk(t5.slot_id);
  check('slot không bị nhả oan', slot5 != null);

  console.log('=== TEST 6: CHỐNG THU TIỀN 2 LẦN — không chắc link cũ đã chết thì KHÔNG phát link mới ===');
  // PayOS không tra được → không thể khẳng định link cũ đã chết → phải DỪNG, nếu vẫn phát link
  // mới thì khách có 2 link cùng sống và có thể trả tiền hai lần cho một chỗ đỗ.
  const paymentsOfT5 = await Payment.findAll({ where: { reservation_id: t5.reservation_id } });
  check('KHÔNG đẻ thêm payment thứ 2', paymentsOfT5.length === 1, `(có ${paymentsOfT5.length})`);
  check('payment cũ GIỮ pending (chưa dám đánh failed)', (await p5.reload()).status === 'pending');
  check('không có payment nào thành success', paymentsOfT5.every((p) => p.status !== 'success'));
  check('đơn chưa confirmed', (await Reservation.findByPk(t5.reservation_id)).status === 'pending');
};

try {
  await run();
} catch (err) {
  fail += 1;
  console.log('LỖI NGOÀI DỰ KIẾN:', err.message);
} finally {
  await Payment.destroy({ where: { reservation_id: cleanup.reservations } });
  for (const id of cleanup.reservations) await Reservation.destroy({ where: { reservation_id: id } });
  console.log(`\n=== KẾT QUẢ: ${pass} PASS / ${fail} FAIL ===`);
  console.log('LƯU Ý: nhánh tạo link PayOS THẬT + tái dùng link cũ phải test tay (PayOS = tiền thật).');
  await sequelize.close();
  process.exit(fail ? 1 : 0);
}
