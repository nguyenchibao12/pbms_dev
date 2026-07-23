// Acceptance test — validateAndNormalizePlateVN (utils/plateVN.js).
// Bug đã vá: biển XE MÁY đời cũ "seri chữ+số + 4 SỐ" (vd 82-H3 9423) bị từ chối oan — lọt khe giữa
// pattern "seri chữ+số" (bắt buộc 5 số) và pattern "4 số" (chỉ nhận seri toàn chữ).
// Không cần DB. Chạy: node scripts/testPlateVN.js
import { validateAndNormalizePlateVN } from '../src/utils/plateVN.js';

let pass = 0;
let fail = 0;
const ok = (input, expected, note) => {
  const r = validateAndNormalizePlateVN(input);
  if (r.valid && r.normalized === expected) { pass += 1; console.log(`  PASS: ${input} → ${r.normalized}  (${note})`); }
  else { fail += 1; console.log(`  FAIL: ${input} → mong "${expected}", nhận ${r.valid ? `"${r.normalized}"` : `LỖI "${r.error}"`}  (${note})`); }
};
const reject = (input, note) => {
  const r = validateAndNormalizePlateVN(input);
  if (!r.valid) { pass += 1; console.log(`  PASS: ${input} → bị từ chối đúng  (${note})`); }
  else { fail += 1; console.log(`  FAIL: ${input} → LẼ RA phải từ chối, nhưng nhận "${r.normalized}"  (${note})`); }
};

console.log('=== BUG ĐÃ VÁ: xe máy seri chữ+số + 4 số (biển cũ) ===');
ok('82-H39423', '82H3-9423', 'biển thật, gõ liền như trên UI');
ok('82-H3 9423', '82H3-9423', 'có dấu cách (2 hàng trên biển)');
ok('82H3-9423', '82H3-9423', 'đã ở dạng chuẩn hoá');
ok('82h3-9423', '82H3-9423', 'gõ chữ thường → tự hoa');
ok('82-H3.9423', '82H3-9423', 'phân tách bằng dấu chấm');
ok('59-P1 1234', '59P1-1234', 'tỉnh khác, seri khác');

console.log('=== REGRESSION: các định dạng cũ vẫn phải đúng ===');
ok('59-F1 34567', '59F1-345.67', 'xe máy seri chữ+số, 5 số');
ok('59F1-345.67', '59F1-345.67', 'xe máy 5 số có dấu chấm');
ok('29A-1234', '29A-1234', 'biển cũ 4 số, seri TOÀN CHỮ');
ok('30A-12345', '30A-123.45', 'ô tô 5 số liền → tự chấm');
ok('51F-123.45', '51F-123.45', 'ô tô có dấu chấm');
ok('30AB-123.45', '30AB-123.45', 'ô tô 2 chữ (2025)');

console.log('=== CHUẨN HÓA TẬP KÝ TỰ SERI: thêm U, bỏ Q/R/W ===');
ok('29U-123.45', '29U-123.45', 'ô tô seri U (trước đây bị chặn oan)');
ok('30U-12345', '30U-123.45', 'ô tô U 5 số liền → tự chấm');
ok('29-U1 23456', '29U1-234.56', 'xe máy seri U');
reject('30Q-123.45', 'Q không cấp cho biển dân sự');
reject('30W-123.45', 'W không cấp cho biển dân sự');
reject('51W-999.99', 'W không cấp cho biển dân sự');
reject('29R-1234', 'R dành rơ-moóc — không nhận ở bãi này');

console.log('=== VẪN PHẢI TỪ CHỐI (không nới lỏng quá tay) ===');
reject('', 'rỗng');
reject('82-H3 942', 'chỉ 3 số → không hợp lệ');
reject('82-H3 942333', '6 số → quá dài');
reject('09-H3 9423', 'mã tỉnh 09 < 11 → không hợp lệ');
reject('82-I3 9423', 'chữ I không dùng cho seri');
reject('82-O1 9423', 'chữ O không dùng cho seri');
reject('ABCXYZ', 'rác');

console.log(`\n=== KẾT QUẢ: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
