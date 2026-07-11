// Acceptance test — SIẾT XÁC MINH EMAIL.
// Chưa verify thì: KHÔNG đăng nhập, KHÔNG đặt chỗ, KHÔNG mua vé tháng được.
// Dựng app Express lên cổng tạm và gọi HTTP THẬT (chứng minh cả chuỗi route + middleware,
// không chỉ gọi service). Không gọi PayOS thật. Tự dọn dữ liệu.
// Chạy: node scripts/testEmailVerificationGate.js
import 'dotenv/config';
import crypto from 'crypto';
import sequelize from '../src/config/db.js';
import app from '../src/app.js';
import { UserAccount } from '../src/models/index.js';
import { signToken } from '../src/utils/jwt.js';
import { register, verifyEmail, resendVerification } from '../src/services/auth.service.js';

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
// Alias +tag của hộp thư thật: Brevo GIAO ĐƯỢC (gửi vào @example.com sẽ bounce, hại uy tín sender).
const EMAIL = `buihaminhnhat03+${USERNAME}@gmail.com`;
const PASSWORD = 'Xxx@123456';
const created = [];

// Hash token là một chiều → không dựng ngược được. Tự phát token y như issueVerificationEmail.
const plantVerificationToken = async (user) => {
  const token = crypto.randomBytes(32).toString('hex');
  await user.update({
    verification_token_hash: sha256(token),
    verification_token_expires: new Date(Date.now() + 3600 * 1000),
  });
  return token;
};

let server;
let baseUrl;
const startServer = () =>
  new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });

const callApi = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, code: json?.error?.code, body: json };
};

const run = async () => {
  await startServer();

  console.log('=== TEST 1: Đăng ký KHÔNG được phát JWT (phát = chưa verify vẫn xài được API) ===');
  const reg = await grab(() =>
    register({ username: USERNAME, password: PASSWORD, fullName: 'Verify Test', email: EMAIL }),
  );
  if (!reg.ok && reg.code === 'MAIL_NOT_CONFIGURED') {
    check('register chặn 503 khi máy chưa cấu hình mail (fail-closed đúng thiết kế)', reg.status === 503);
    return;
  }
  check('register thành công', reg.ok === true, JSON.stringify(reg));
  const user = await UserAccount.unscoped().findOne({ where: { email: EMAIL } });
  if (user) created.push(user.user_id);
  check('KHÔNG trả về token', reg.ok && reg.value.token === undefined);
  check('email_verified = false khi mới đăng ký', user?.email_verified === false);

  console.log('=== TEST 2: Chưa verify → ĐĂNG NHẬP BỊ CHẶN (403 EMAIL_NOT_VERIFIED) ===');
  const l1 = await callApi('POST', '/api/auth/login', { body: { username: USERNAME, password: PASSWORD } });
  check('login bị chặn 403', l1.status === 403, JSON.stringify(l1));
  check('code = EMAIL_NOT_VERIFIED (FE bắt để hiện nút gửi lại)', l1.code === 'EMAIL_NOT_VERIFIED');

  console.log('=== TEST 3: Sai mật khẩu → vẫn 401, KHÔNG lộ tài khoản có thật / chưa verify ===');
  const l2 = await callApi('POST', '/api/auth/login', { body: { username: USERNAME, password: 'SaiMatKhau@1' } });
  check('sai mật khẩu → 401 (không phải 403)', l2.status === 401, JSON.stringify(l2));

  console.log('=== TEST 4: Cầm JWT hợp lệ nhưng CHƯA VERIFY → không đặt chỗ / mua vé tháng được ===');
  // Token ký thật — mô phỏng token phát TRƯỚC khi siết (JWT sống 30 ngày).
  const rawToken = signToken({ userId: user.user_id, roleName: 'User' });

  const me = await callApi('GET', '/api/auth/me', { token: rawToken });
  check('GET /auth/me → 403 EMAIL_NOT_VERIFIED', me.status === 403 && me.code === 'EMAIL_NOT_VERIFIED', JSON.stringify(me));

  const booking = await callApi('POST', '/api/reservations', {
    token: rawToken,
    body: {
      plateNumber: '51F-67890', vehicleTypeId: 1, floorId: 2,
      shiftId: 'afternoon', arrivalDate: '2026-07-20',
    },
  });
  check('POST /reservations (ĐẶT CHỖ) → 403 EMAIL_NOT_VERIFIED',
    booking.status === 403 && booking.code === 'EMAIL_NOT_VERIFIED', JSON.stringify(booking));

  const buyPass = await callApi('POST', '/api/monthly-passes', {
    token: rawToken,
    body: { plateNumber: '51F-67890', vehicleTypeId: 1, floorId: 2, startDate: '2026-08-01' },
  });
  check('POST /monthly-passes (MUA VÉ THÁNG) → 403 EMAIL_NOT_VERIFIED',
    buyPass.status === 403 && buyPass.code === 'EMAIL_NOT_VERIFIED', JSON.stringify(buyPass));

  console.log('=== TEST 5: Verify sai token → 400; đúng token → verified ===');
  const token = await plantVerificationToken(user);
  const bad = await grab(() => verifyEmail({ email: EMAIL, token: 'sai-token-hoan-toan' }));
  check('token sai → 400 VERIFY_TOKEN_INVALID', bad.status === 400 && bad.code === 'VERIFY_TOKEN_INVALID');
  const good = await grab(() => verifyEmail({ email: EMAIL, token }));
  check('token đúng → xác minh thành công', good.ok === true, JSON.stringify(good));
  await user.reload();
  check('email_verified = true trong DB', user.email_verified === true);

  console.log('=== TEST 6: Sau khi verify → ĐĂNG NHẬP + ĐẶT CHỖ ĐƯỢC ===');
  const l3 = await callApi('POST', '/api/auth/login', { body: { username: USERNAME, password: PASSWORD } });
  check('login 200 + có JWT', l3.status === 200 && typeof l3.body?.data?.token === 'string', JSON.stringify(l3));
  const goodToken = l3.body?.data?.token;
  const me2 = await callApi('GET', '/api/auth/me', { token: goodToken });
  check('GET /auth/me → 200 (hết bị chặn)', me2.status === 200, JSON.stringify(me2));
  const booking2 = await callApi('POST', '/api/reservations', {
    token: goodToken,
    body: {
      plateNumber: '51F-67890', vehicleTypeId: 1, floorId: 2,
      shiftId: 'afternoon', arrivalDate: '2026-07-20',
    },
  });
  // 201 = đặt được. 502 = PayOS lỗi — vẫn CHỨNG MINH đã qua được cửa xác minh (không còn 403).
  check('POST /reservations KHÔNG còn 403 (đã qua cửa xác minh)', booking2.status !== 403,
    JSON.stringify({ status: booking2.status, code: booking2.code }));

  console.log('=== TEST 7: Bấm LẠI link cũ (idempotent) nhưng không thành kênh dò email ===');
  const again = await grab(() => verifyEmail({ email: EMAIL, token }));
  check('bấm lại đúng link → vẫn báo đã xác minh', again.ok === true, JSON.stringify(again));
  const probe = await grab(() => verifyEmail({ email: EMAIL, token: 'token-bat-ky' }));
  check('email ĐÃ verify + token bậy → 400 (không xác nhận email có thật)', probe.status === 400);
  const ghost = await grab(() => verifyEmail({ email: 'khongtontai@example.com', token: 'token-bat-ky' }));
  check('email không tồn tại → CÙNG lỗi 400 (không phân biệt được)', ghost.status === 400 && ghost.code === probe.code);

  console.log('=== TEST 8: resend luôn trả message chung, không lộ trạng thái ===');
  const rs1 = await grab(() => resendVerification({ email: EMAIL }));
  const rs2 = await grab(() => resendVerification({ email: 'khongtontai@example.com' }));
  check('2 message giống hệt nhau', rs1.value?.message === rs2.value?.message);
};

try {
  await run();
} catch (err) {
  fail += 1;
  console.log('LỖI NGOÀI DỰ KIẾN:', err.message);
} finally {
  for (const id of created) {
    await sequelize.query(
      'DELETE p FROM payment p JOIN reservation r ON p.reservation_id = r.reservation_id WHERE r.user_id = ?',
      { replacements: [id] },
    ).catch(() => {});
    await sequelize.query(
      "UPDATE parking_slot ps JOIN reservation r ON ps.slot_id = r.slot_id SET ps.status = 'available' WHERE r.user_id = ?",
      { replacements: [id] },
    ).catch(() => {});
    await sequelize.query('DELETE FROM reservation WHERE user_id = ?', { replacements: [id] }).catch(() => {});
    await UserAccount.destroy({ where: { user_id: id } }).catch(() => {});
  }
  if (server) server.close();
  console.log(`\n=== KẾT QUẢ: ${pass} PASS / ${fail} FAIL ===`);
  await sequelize.close();
  process.exit(fail ? 1 : 0);
}
