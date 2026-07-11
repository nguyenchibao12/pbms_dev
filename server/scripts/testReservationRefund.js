// Acceptance test — Reservation dùng chung hạ tầng hoàn tiền (migration 006).
// Gọi THẲNG service (không HTTP, không PayOS). Chạy: node scripts/testReservationRefund.js
// Tự tạo dữ liệu test rồi DỌN SẠCH (chỉ để lại seed như cũ).
import 'dotenv/config';
import sequelize from '../src/config/db.js';
import {
  Reservation,
  Payment,
  ParkingSlot,
  UserAccount,
  RefundRequest,
} from '../src/models/index.js';
import { cancelUserReservation, confirmReservationAfterPayment } from '../src/services/reservation.service.js';
import { listRefunds, completeRefund, expireStaleRefunds } from '../src/services/refund.service.js';

const USER_ID = 4;   // seed: user thường
const ADMIN_ID = 1;  // seed: admin
let pass = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  PASS: ${name}`); }
  else { fail += 1; console.log(`  FAIL: ${name} ${extra}`); }
};

const cleanupIds = { reservations: [], payments: [], refunds: [] };

// Slot trống bất kỳ + zone/floor/vehicle_type đi kèm để dựng reservation hợp lệ.
const pickSlot = async () => {
  const slot = await ParkingSlot.findOne({
    where: { status: 'available' },
    include: [{ association: 'zone' }],
  });
  if (!slot) throw new Error('Không còn slot available trong DB dev — seed lại rồi chạy test');
  return slot;
};

const makeReservation = async ({ startInMs, status = 'confirmed', plate }) => {
  const slot = await pickSlot();
  const start = new Date(Date.now() + startInMs);
  const end = new Date(start.getTime() + 4 * 3600 * 1000);
  const resv = await Reservation.create({
    user_id: USER_ID,
    vehicle_type_id: slot.zone.vehicle_type_id,
    floor_id: slot.zone.floor_id,
    zone_id: slot.zone_id,
    slot_id: slot.slot_id,
    plate_number: plate,
    start_time: start,
    end_time: end,
    status,
    reservation_type: 'standard',
    qr_token: `test-refund-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  });
  cleanupIds.reservations.push(resv.reservation_id);
  if (status === 'confirmed') await slot.update({ status: 'reserved' });
  return { resv, slot };
};

const makePayment = async (reservationId, status, amount = 10000) => {
  const p = await Payment.create({
    reservation_id: reservationId,
    order_code: Math.floor(Date.now() / 1000) * 1000 + Math.floor(Math.random() * 999),
    amount,
    status,
    method: 'payos',
    paid_at: status === 'success' ? new Date() : null,
  });
  cleanupIds.payments.push(p.payment_id);
  return p;
};

const run = async () => {
  console.log('=== TEST 1: Hủy TRƯỚC cutoff → refund_request pending, payment GIỮ success ===');
  const t1 = await makeReservation({ startInMs: 72 * 3600 * 1000, plate: '98A-00001' });
  const p1 = await makePayment(t1.resv.reservation_id, 'success');
  const r1 = await cancelUserReservation(USER_ID, t1.resv.reservation_id);
  const rr1 = await RefundRequest.findOne({ where: { reservation_id: t1.resv.reservation_id } });
  if (rr1) cleanupIds.refunds.push(rr1.refund_id);
  check('refund.eligible = true', r1.refund?.eligible === true);
  check('refund_request được tạo, status pending', rr1?.status === 'pending');
  check('percent = 100, amount đúng', rr1 && rr1.percent === 100 && Number(rr1.amount) === 10000);
  check('payment VẪN success (chưa hoàn thật)', (await p1.reload()).status === 'success');
  check('instructions có hạn cập nhật STK', /tài khoản ngân hàng/.test(r1.refund?.instructions || ''));
  const list1 = await listRefunds({});
  const item1 = list1.items.find((x) => x.refund_id === rr1?.refund_id);
  check("listRefunds thấy item type 'booking' kèm reservation", item1?.type === 'booking' && !!item1?.reservation);

  console.log('=== TEST 2: Hủy SÁT GIỜ → không tạo refund_request, hành vi cũ giữ nguyên ===');
  const t2 = await makeReservation({ startInMs: 20 * 60 * 1000, plate: '98A-00002' });
  const p2 = await makePayment(t2.resv.reservation_id, 'success');
  const r2 = await cancelUserReservation(USER_ID, t2.resv.reservation_id);
  const rr2 = await RefundRequest.findOne({ where: { reservation_id: t2.resv.reservation_id } });
  check('refund.eligible = false + forfeited', r2.refund?.eligible === false && r2.refund?.forfeitedAmount === 10000);
  check('KHÔNG tạo refund_request', !rr2);
  check('payment giữ success', (await p2.reload()).status === 'success');

  console.log('=== TEST 3: User có STK → completeRefund → refund + payment cùng refunded ===');
  const user = await UserAccount.findByPk(USER_ID);
  const oldBank = {
    bank_name: user.bank_name,
    bank_account_number: user.bank_account_number,
    bank_account_holder: user.bank_account_holder,
  };
  await user.update({ bank_name: 'TestBank', bank_account_number: '000111222333', bank_account_holder: 'TEST USER' });
  const done = await completeRefund(ADMIN_ID, rr1.refund_id, { note: 'test chuyển khoản' });
  check('refund_request → refunded', done.status === 'refunded' && done.refunded_by === ADMIN_ID);
  check('payment LÚC NÀY mới refunded', (await p1.reload()).status === 'refunded');
  await user.update(oldBank); // trả seed về như cũ

  console.log('=== TEST 4: Tiền về SAU khi hủy → tạo refund_request, gọi lặp không trùng ===');
  const t4 = await makeReservation({ startInMs: 72 * 3600 * 1000, status: 'cancelled', plate: '98A-00004' });
  const p4 = await makePayment(t4.resv.reservation_id, 'pending');
  await confirmReservationAfterPayment(p4);
  const rr4a = await RefundRequest.findAll({ where: { reservation_id: t4.resv.reservation_id } });
  rr4a.forEach((r) => cleanupIds.refunds.push(r.refund_id));
  check('tạo đúng 1 refund_request pending 100%', rr4a.length === 1 && rr4a[0].status === 'pending' && rr4a[0].percent === 100);
  check('payment chuyển success (tiền đã về thật)', (await p4.reload()).status === 'success');
  await confirmReservationAfterPayment(await Payment.findByPk(p4.payment_id)); // webhook gọi lặp
  const rr4b = await RefundRequest.findAll({ where: { reservation_id: t4.resv.reservation_id } });
  check('gọi lặp → vẫn đúng 1 request (idempotent)', rr4b.length === 1);

  console.log('=== TEST 5: Job expire — quá 7 ngày không STK → expired; có STK → giữ pending ===');
  const old = new Date(Date.now() - 8 * 24 * 3600 * 1000);
  await rr4a[0].update({ requested_at: old }); // user 4 đang KHÔNG có STK (đã trả về null ở test 3)
  const expired = await expireStaleRefunds();
  check('job đánh expired yêu cầu quá hạn không STK', expired >= 1 && (await rr4a[0].reload()).status === 'expired');

  console.log('=== TEST 6: Hook exactly-one (regression cho nhánh pass) ===');
  const both = RefundRequest.build({ pass_id: 1, reservation_id: 1, payment_id: 1, user_id: 1, percent: 100, amount: 1, requested_at: new Date() });
  const neither = RefundRequest.build({ payment_id: 1, user_id: 1, percent: 100, amount: 1, requested_at: new Date() });
  check('cả 2 nguồn → bị chặn', await both.validate().then(() => false).catch(() => true));
  check('không nguồn nào → bị chặn', await neither.validate().then(() => false).catch(() => true));

  // Dọn dữ liệu test (thứ tự FK: refund → payment → reservation) + trả slot về available.
  console.log('--- Dọn dữ liệu test ---');
  await RefundRequest.destroy({ where: { refund_id: cleanupIds.refunds } });
  await Payment.destroy({ where: { payment_id: cleanupIds.payments } });
  for (const id of cleanupIds.reservations) {
    const r = await Reservation.findByPk(id);
    if (r) {
      await ParkingSlot.update({ status: 'available' }, { where: { slot_id: r.slot_id, status: 'reserved' } });
      await r.destroy();
    }
  }

  console.log(`\nKẾT QUẢ: ${pass} PASS / ${fail} FAIL`);
  process.exitCode = fail > 0 ? 1 : 0;
};

run()
  .catch((err) => { console.error('Test lỗi:', err); process.exitCode = 1; })
  .finally(() => sequelize.close());
