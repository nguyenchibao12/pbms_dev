// Acceptance test — POST /monthly-passes/:id/repay (trả tiếp phí vé tháng đơn pending).
// KHÔNG gọi PayOS thật (PayOS là tiền thật): gỡ PAYOS_CLIENT_ID khỏi process.env để mô phỏng
// gateway hỏng → kiểm các guard + CHỐNG THU TIỀN 2 LẦN (fail-closed). Nhánh tái dùng link cũ
// (PENDING) và kích hoạt khi PAID phải test tay qua Swagger/FE (xem cuối). Tự dọn dữ liệu.
// Chạy: node scripts/testMonthlyPassRepay.js
import 'dotenv/config';
import sequelize from '../src/config/db.js';
import { MonthlyPass, Payment } from '../src/models/index.js';
import { repayMonthlyPass } from '../src/services/monthlyPass.service.js';

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
    plate_number: '96A-00002',
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

const run = async () => {
  // Mô phỏng PayOS chết cho TOÀN BỘ test — không tiêu tiền thật, không tạo/hủy link thật.
  delete process.env.PAYOS_CLIENT_ID;

  console.log('=== TEST 1: Không phải vé của mình → 403, KHÔNG đụng payment cũ ===');
  const t1 = await makePass();
  const p1 = await makePendingPayment(t1.pass_id);
  const r1 = await grab(() => repayMonthlyPass(OTHER_USER_ID, t1.pass_id));
  check('403 FORBIDDEN', r1.ok === false && r1.status === 403, JSON.stringify(r1));
  check('payment cũ KHÔNG bị đánh failed', (await p1.reload()).status === 'pending');

  console.log('=== TEST 2: Vé không pending (đã active) → 409, không tạo link ===');
  const t2 = await makePass({ status: 'active' });
  const r2 = await grab(() => repayMonthlyPass(USER_ID, t2.pass_id));
  check('409 CONFLICT', r2.ok === false && r2.status === 409, JSON.stringify(r2));
  check('message nêu trạng thái hiện tại', /active/.test(r2.message || ''), r2.message);

  console.log('=== TEST 3: Vé không tồn tại → 404 ===');
  const r3 = await grab(() => repayMonthlyPass(USER_ID, 99999999));
  check('404 NOT_FOUND', r3.ok === false && r3.status === 404);

  console.log('=== TEST 4: CHỐNG THU TIỀN 2 LẦN — không chắc link cũ đã chết thì DỪNG (502) ===');
  // PayOS không tra được → không thể khẳng định link cũ đã chết → phải DỪNG. Nếu vẫn phát link
  // mới thì khách có 2 link cùng sống và có thể trả tiền hai lần cho một vé tháng.
  const t4 = await makePass();
  const p4 = await makePendingPayment(t4.pass_id);
  const r4 = await grab(() => repayMonthlyPass(USER_ID, t4.pass_id));
  check('502 PAYMENT_GATEWAY_ERROR', r4.ok === false && r4.status === 502, JSON.stringify(r4));
  const paymentsOfT4 = await Payment.findAll({ where: { pass_id: t4.pass_id } });
  check('KHÔNG đẻ thêm payment thứ 2', paymentsOfT4.length === 1, `(có ${paymentsOfT4.length})`);
  check('payment cũ GIỮ pending (chưa dám đánh failed)', (await p4.reload()).status === 'pending');
  check('không có payment nào success', paymentsOfT4.every((p) => p.status !== 'success'));
  check('vé VẪN pending (không bị kích hoạt/hủy oan)', (await MonthlyPass.findByPk(t4.pass_id)).status === 'pending');
};

try {
  await run();
} catch (err) {
  fail += 1;
  console.log('LỖI NGOÀI DỰ KIẾN:', err.message);
} finally {
  await Payment.destroy({ where: { pass_id: cleanup.passes } });
  for (const id of cleanup.passes) await MonthlyPass.destroy({ where: { pass_id: id } });
  console.log(`\n=== KẾT QUẢ: ${pass} PASS / ${fail} FAIL ===`);
  console.log('LƯU Ý: nhánh tái dùng link cũ (PENDING) + kích hoạt khi PAID phải test tay (PayOS = tiền thật).');
  await sequelize.close();
  process.exit(fail ? 1 : 0);
};
