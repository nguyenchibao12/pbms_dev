// Verify — getOverviewReport lọc DOANH THU theo floorId (trước đây revenue bỏ qua floorId
// nên báo cáo 1 tầng lại hiện doanh thu toàn bãi). Dùng paid_at ngày 2099 (unique, không đụng
// seed) + 2 vé tháng F1/F2 với số tiền phân biệt. Tự dọn dữ liệu.
// Chạy: node scripts/testReportRevenueByFloor.js
import 'dotenv/config';
import sequelize from '../src/config/db.js';
import { MonthlyPass, Payment } from '../src/models/index.js';
import { getOverviewReport } from '../src/services/report.service.js';

let pass = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  PASS: ${name}`); }
  else { fail += 1; console.log(`  FAIL: ${name} ${extra}`); }
};

const DAY = '2099-06-15';
const PAID_AT = new Date('2099-06-15T09:30:00');
const AMT_F1 = 111000;
const AMT_F2 = 222000;
const cleanup = { passes: [] };

const makePaidPass = async (floorId, amount) => {
  const p = await MonthlyPass.create({
    user_id: 4,
    vehicle_type_id: 1,
    floor_id: floorId,
    plate_number: `99Z-${floorId}0000`,
    valid_from_time: '06:00:00',
    valid_to_time: '22:00:00',
    start_date: DAY,
    end_date: DAY,
    status: 'active',
  });
  cleanup.passes.push(p.pass_id);
  await Payment.create({
    pass_id: p.pass_id,
    order_code: Math.floor(Date.now() / 1000) * 1000 + Math.floor(Math.random() * 999),
    amount,
    status: 'success',
    method: 'payos',
    paid_at: PAID_AT,
  });
  return p;
};

const totalOf = (report) => Number(report.revenue.total);
const passTypeOf = (report) => {
  const row = report.revenue.byType.find((r) => r.type === 'monthly_pass');
  return row ? Number(row.total) : 0;
};

const run = async () => {
  await makePaidPass(1, AMT_F1);
  await makePaidPass(2, AMT_F2);

  const rAll = await getOverviewReport({ from: DAY, to: DAY });
  const r1 = await getOverviewReport({ from: DAY, to: DAY, floorId: 1 });
  const r2 = await getOverviewReport({ from: DAY, to: DAY, floorId: 2 });
  const r3 = await getOverviewReport({ from: DAY, to: DAY, floorId: 3 });

  console.log('=== Doanh thu toàn bãi (không floorId) = F1 + F2 ===');
  check('total = 333000', totalOf(rAll) === AMT_F1 + AMT_F2, `(=${totalOf(rAll)})`);

  console.log('=== Lọc F1 → chỉ doanh thu F1 ===');
  check('total = 111000', totalOf(r1) === AMT_F1, `(=${totalOf(r1)})`);
  check('byType monthly_pass = 111000', passTypeOf(r1) === AMT_F1, `(=${passTypeOf(r1)})`);

  console.log('=== Lọc F2 → chỉ doanh thu F2 ===');
  check('total = 222000', totalOf(r2) === AMT_F2, `(=${totalOf(r2)})`);

  console.log('=== Lọc F3 (không có payment) → 0 ===');
  check('total = 0', totalOf(r3) === 0, `(=${totalOf(r3)})`);

  console.log('=== dailyRevenue của F1 chỉ có ngày 2099-06-15 = 111000 ===');
  const d1 = r1.revenue.daily.find((d) => String(d.date).startsWith(DAY));
  check('daily F1 = 111000', d1 && Number(d1.revenue) === AMT_F1, JSON.stringify(r1.revenue.daily));
};

try {
  await run();
} catch (err) {
  fail += 1;
  console.log('LỖI NGOÀI DỰ KIẾN:', err.stack || err.message);
} finally {
  await Payment.destroy({ where: { pass_id: cleanup.passes } });
  for (const id of cleanup.passes) await MonthlyPass.destroy({ where: { pass_id: id } });
  console.log(`\n=== KẾT QUẢ: ${pass} PASS / ${fail} FAIL ===`);
  await sequelize.close();
  process.exit(fail ? 1 : 0);
}
