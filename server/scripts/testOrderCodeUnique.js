// Verify — generateOrderCode: số nguyên dương, an toàn (<= trần PayOS), KHÔNG trùng trong
// cùng tiến trình dù sinh liên tiếp trong 1 ms. Không cần DB.
// Chạy: node scripts/testOrderCodeUnique.js
import { generateOrderCode } from '../src/services/payos.client.js';

let pass = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  PASS: ${name}`); }
  else { fail += 1; console.log(`  FAIL: ${name} ${extra}`); }
};

const PAYOS_MAX = 9_007_199_254_740_991; // = Number.MAX_SAFE_INTEGER, trần orderCode PayOS
const N = 20000;

const codes = [];
const seen = new Set();
let dup = 0;
let outOfRange = 0;
let notSafe = 0;
for (let i = 0; i < N; i++) {
  const c = generateOrderCode();
  codes.push(c);
  if (seen.has(c)) dup += 1;
  seen.add(c);
  if (c <= 0 || c > PAYOS_MAX) outOfRange += 1;
  if (!Number.isSafeInteger(c)) notSafe += 1;
}

console.log(`=== Sinh ${N} orderCode liên tiếp ===`);
check('không trùng', dup === 0, `(trùng ${dup})`);
check('đều trong (0, PAYOS_MAX]', outOfRange === 0, `(ngoài dải ${outOfRange})`);
check('đều là safe integer', notSafe === 0, `(không safe ${notSafe})`);
check('đơn điệu tăng (không lặp mốc cũ)', codes.every((c, i) => i === 0 || c > codes[i - 1]));

console.log(`\n=== KẾT QUẢ: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
