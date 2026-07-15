// Acceptance test — activatePassAfterPayment khi tiền về SAU khi vé đã bị hủy/hết hạn.
// Vá lỗ hổng: job passMaintenance hủy vé pending quá TTL; khách trả tiền muộn → trước đây
// activate ném CONFLICT, tiền kẹt mà KHÔNG có yêu cầu hoàn nào (mất tiền âm thầm). Nay phải
// tạo RefundRequest 100% cho Admin, đối xứng với confirmReservationAfterPayment (nhánh cancelled).
// KHÔNG gọi PayOS (hàm nhận thẳng payment object) — không tiêu tiền thật. Tự dọn dữ liệu.
// Chạy: node scripts/testPassPaidAfterCancel.js
import 'dotenv/config';
import sequelize from '../src/config/db.js';
import { MonthlyPass, Payment, RefundRequest } from '../src/models/index.js';
import { activatePassAfterPayment } from '../src/services/monthlyPass.service.js';

const USER_ID = 4; // seed: user thường
let pass = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  PASS: ${name}`); }
  else { fail += 1; console.log(`  FAIL: ${name} ${extra}`); }
};
const grab = async (fn) => {
  try { return { ok: true, value: await fn() }; }
  catch (err) { return { ok: false, code: err.errorCode || err.code, status: err.statusCode, message: err.message }; }
};

const cleanup = { passes: [] };

const makePass = async ({ status = 'pending' } = {}) => {
  const today = new Date();
  const end = new Date(today.getTime() + 30 * 86400000);
  const p = await MonthlyPass.create({
    user_id: USER_ID,
    vehicle_type_id: 1, // CAR
    floor_id: 1,        // F1
    plate_number: '96A-00003',
    valid_from_time: '06:00:00',
    valid_to_time: '22:00:00',
    start_date: today.toISOString().slice(0, 10),
    end_date: end.toISOString().slice(0, 10),
    status,
  });
  cleanup.passes.push(p.pass_id);
  return p;
};

const makePendingPayment = async (passId, amount = 500000) => Payment.create({
  pass_id: passId,
  order_code: Math.floor(Date.now() / 1000) * 1000 + Math.floor(Math.random() * 999),
  amount,
  status: 'pending',
  method: 'payos',
  gateway_response: JSON.stringify({ checkoutUrl: 'https://pay.payos.vn/web/CU-CU-CU' }),
});

const refundsFor = (passId) => RefundRequest.findAll({ where: { pass_id: passId } });

const run = async () => {
  console.log('=== TEST 1: Tiền về khi vé đã CANCELLED → tạo RefundRequest 100%, KHÔNG ném lỗi ===');
  const t1 = await makePass({ status: 'cancelled' });
  const p1 = await makePendingPayment(t1.pass_id, 500000);
  const r1 = await grab(() => activatePassAfterPayment(p1));
  check('không ném lỗi (trước đây CONFLICT)', r1.ok === true, JSON.stringify(r1));
  check('trả refunded:true, activated:false', r1.value?.refunded === true && r1.value?.activated === false);
  check('payment → success (tiền ĐÃ về thật)', (await p1.reload()).status === 'success');
  const rf1 = await refundsFor(t1.pass_id);
  check('tạo đúng 1 RefundRequest', rf1.length === 1, `(có ${rf1.length})`);
  check('refund percent = 100', rf1[0]?.percent === 100);
  check('refund amount = 500000', Number(rf1[0]?.amount) === 500000, `(=${rf1[0]?.amount})`);
  check('refund gắn đúng pass_id, không gắn reservation', rf1[0]?.pass_id === t1.pass_id && rf1[0]?.reservation_id == null);
  check('vé GIỮ cancelled (không hồi sinh)', (await MonthlyPass.findByPk(t1.pass_id)).status === 'cancelled');

  console.log('=== TEST 2: Idempotent — gọi lại (webhook + verify) KHÔNG đẻ refund thứ 2 ===');
  const p1again = await Payment.findByPk(p1.payment_id);
  const r2 = await grab(() => activatePassAfterPayment(p1again));
  check('không ném lỗi khi gọi lại', r2.ok === true, JSON.stringify(r2));
  // payment giờ đã 'success' → nhánh đầu trả alreadyProcessed; refund vẫn chỉ 1.
  const rf2 = await refundsFor(t1.pass_id);
  check('vẫn đúng 1 RefundRequest (không trùng)', rf2.length === 1, `(có ${rf2.length})`);

  console.log('=== TEST 3: Tiền về khi vé đã EXPIRED → cũng hoàn 100% ===');
  const t3 = await makePass({ status: 'expired' });
  const p3 = await makePendingPayment(t3.pass_id, 500000);
  const r3 = await grab(() => activatePassAfterPayment(p3));
  check('không ném lỗi', r3.ok === true, JSON.stringify(r3));
  check('refunded:true', r3.value?.refunded === true);
  check('tạo đúng 1 RefundRequest', (await refundsFor(t3.pass_id)).length === 1);
  check('payment → success', (await p3.reload()).status === 'success');

  console.log('=== TEST 4: HAPPY PATH cũ vẫn đúng — vé pending → active, KHÔNG hoàn tiền ===');
  const t4 = await makePass({ status: 'pending' });
  const p4 = await makePendingPayment(t4.pass_id, 500000);
  const r4 = await grab(() => activatePassAfterPayment(p4));
  check('activated:true', r4.ok === true && r4.value?.activated === true, JSON.stringify(r4));
  const t4after = await MonthlyPass.findByPk(t4.pass_id);
  check('vé → active', t4after.status === 'active');
  check('vé có qr_token', Boolean(t4after.qr_token));
  check('payment → success', (await p4.reload()).status === 'success');
  check('KHÔNG tạo RefundRequest', (await refundsFor(t4.pass_id)).length === 0);
};

try {
  await run();
} catch (err) {
  fail += 1;
  console.log('LỖI NGOÀI DỰ KIẾN:', err.message);
} finally {
  await RefundRequest.destroy({ where: { pass_id: cleanup.passes } });
  await Payment.destroy({ where: { pass_id: cleanup.passes } });
  for (const id of cleanup.passes) await MonthlyPass.destroy({ where: { pass_id: id } });
  console.log(`\n=== KẾT QUẢ: ${pass} PASS / ${fail} FAIL ===`);
  await sequelize.close();
  process.exit(fail ? 1 : 0);
}
