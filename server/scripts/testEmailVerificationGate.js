// Acceptance test — SIẾT XÁC MINH EMAIL: chưa verify thì không đăng nhập/không dùng API được.
// Gọi THẲNG service (không HTTP, không gửi mail thật nếu chưa cấu hình). Tự dọn dữ liệu.
// Chạy: node scripts/testEmailVerificationGate.js
import 'dotenv/config';
import crypto from 'crypto';
import sequelize from '../src/config/db.js';
import { UserAccount } from '../src/models/index.js';
import {
  register,
  login,
  verifyEmail,
  resendVerification,
  assertEmailVerified,
} from '../src/services/auth.service.js';

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

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
const TAG = Date.now().toString().slice(-6);
const USERNAME = `vtest${TAG}`;
// Alias +tag của hộp thư thật: Brevo GIAO ĐƯỢC (gửi vào @example.com sẽ bounce, hại uy tín
// sender). Mail xác minh sẽ rơi vào inbox này — xóa được, không ảnh hưởng gì.
const EMAIL = `buihaminhnhat03+${USERNAME}@gmail.com`;
const PASSWORD = 'Xxx@123456';
const created = [];

// Lấy token xác minh THẬT: dựng lại từ hash là không thể (một chiều) → tự phát token mới
// giống hệt cách issueVerificationEmail làm, rồi ghi hash vào DB.
const plantVerificationToken = async (user) => {
  const token = crypto.randomBytes(32).toString('hex');
  await user.update({
    verification_token_hash: sha256(token),
    verification_token_expires: new Date(Date.now() + 3600 * 1000),
  });
  return token;
};

const run = async () => {
  console.log('=== TEST 1: Đăng ký KHÔNG được phát JWT (nếu phát = user chưa verify vẫn xài API) ===');
  const reg = await grab(() =>
    register({ username: USERNAME, password: PASSWORD, fullName: 'Verify Test', email: EMAIL }),
  );
  if (!reg.ok && reg.code === 'MAIL_NOT_CONFIGURED') {
    console.log('  (bỏ qua: máy này chưa cấu hình BREVO_API_KEY/MAIL_FROM — đúng thiết kế fail-closed)');
    check('register chặn khi chưa cấu hình mail', reg.status === 503);
    return;
  }
  check('register thành công', reg.ok === true, JSON.stringify(reg));
  const user = await UserAccount.unscoped().findOne({ where: { email: EMAIL } });
  if (user) created.push(user.user_id);
  check('KHÔNG trả về token', reg.ok && reg.value.token === undefined);
  check('email_verified = false khi mới đăng ký', user?.email_verified === false);

  console.log('=== TEST 2: Chưa verify → ĐĂNG NHẬP BỊ CHẶN (403 EMAIL_NOT_VERIFIED) ===');
  const l1 = await grab(() => login({ username: USERNAME, password: PASSWORD }));
  check('login bị chặn', l1.ok === false && l1.status === 403, JSON.stringify(l1));
  check('mã lỗi EMAIL_NOT_VERIFIED (FE bắt để hiện nút gửi lại)', l1.code === 'EMAIL_NOT_VERIFIED');

  console.log('=== TEST 3: Sai mật khẩu → vẫn 401, KHÔNG lộ chuyện tài khoản tồn tại/chưa verify ===');
  const l2 = await grab(() => login({ username: USERNAME, password: 'SaiMatKhau@1' }));
  check('sai mật khẩu → 401 (không phải 403)', l2.ok === false && l2.status === 401, JSON.stringify(l2));

  console.log('=== TEST 4: Token JWT cũ (phát trước khi siết) cũng bị chặn ở middleware ===');
  const guard = await grab(async () => assertEmailVerified(await UserAccount.findByPk(user.user_id)));
  check('assertEmailVerified chặn user chưa verify', guard.ok === false && guard.code === 'EMAIL_NOT_VERIFIED');

  console.log('=== TEST 5: Verify sai token → 400; đúng token → verified ===');
  const token = await plantVerificationToken(user);
  const bad = await grab(() => verifyEmail({ email: EMAIL, token: 'sai-token-hoan-toan' }));
  check('token sai → 400 VERIFY_TOKEN_INVALID', bad.ok === false && bad.status === 400 && bad.code === 'VERIFY_TOKEN_INVALID');
  const good = await grab(() => verifyEmail({ email: EMAIL, token }));
  check('token đúng → xác minh thành công', good.ok === true, JSON.stringify(good));
  await user.reload();
  check('email_verified = true trong DB', user.email_verified === true);

  console.log('=== TEST 6: Sau khi verify → ĐĂNG NHẬP ĐƯỢC ===');
  const l3 = await grab(() => login({ username: USERNAME, password: PASSWORD }));
  check('login thành công + có JWT', l3.ok === true && typeof l3.value?.token === 'string', JSON.stringify(l3.code || ''));
  check('user.emailVerified = true trong response', l3.ok && l3.value.user.emailVerified === true);

  console.log('=== TEST 7: Bấm LẠI link cũ (idempotent) — nhưng không thành kênh dò email ===');
  const again = await grab(() => verifyEmail({ email: EMAIL, token }));
  check('bấm lại đúng link → vẫn báo đã xác minh', again.ok === true, JSON.stringify(again));
  const probe = await grab(() => verifyEmail({ email: EMAIL, token: 'token-bat-ky' }));
  check('email ĐÃ verify + token bậy → 400 (không xác nhận email có thật)', probe.ok === false && probe.status === 400);
  const probeGhost = await grab(() => verifyEmail({ email: 'khongtontai@example.com', token: 'token-bat-ky' }));
  check('email không tồn tại → CÙNG lỗi 400 (không phân biệt được)', probeGhost.status === 400 && probeGhost.code === probe.code);

  console.log('=== TEST 8: resend cho email đã verify → message chung, không lộ trạng thái ===');
  const rs1 = await grab(() => resendVerification({ email: EMAIL }));
  const rs2 = await grab(() => resendVerification({ email: 'khongtontai@example.com' }));
  check('2 message giống hệt nhau', rs1.ok && rs2.ok && rs1.value.message === rs2.value.message, `${rs1.value?.message} vs ${rs2.value?.message}`);
};

try {
  await run();
} catch (err) {
  fail += 1;
  console.log('LỖI NGOÀI DỰ KIẾN:', err.message);
} finally {
  for (const id of created) await UserAccount.destroy({ where: { user_id: id } });
  console.log(`\n=== KẾT QUẢ: ${pass} PASS / ${fail} FAIL ===`);
  await sequelize.close();
  process.exit(fail ? 1 : 0);
}
