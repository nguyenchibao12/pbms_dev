import * as authService from '../services/auth.service.js';
import { asyncHandler, successResponse, AppError } from '../utils/helpers.js';
import { isGoogleConfigured } from '../utils/google.js';

export const register = asyncHandler(async (req, res) => {
  const { username, password, fullName, email, phone } = req.body;
  const result = await authService.register({
    username,
    password,
    fullName,
    email,
    phone,
  });
  successResponse(res, result, 'Registration successful', 201);
});

export const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  const result = await authService.login({ username, password });
  successResponse(res, result, 'Login successful');
});

export const getMe = asyncHandler(async (req, res) => {
  const user = await authService.getMe(req.user.user_id);
  successResponse(res, user, 'Profile retrieved');
});

export const updateMe = asyncHandler(async (req, res) => {
  const user = await authService.updateMe(req.user.user_id, req.body);
  successResponse(res, user, 'Đã cập nhật hồ sơ');
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const result = await authService.forgotPassword({ email: req.body.email });
  successResponse(res, result, result.message);
});

export const resetPassword = asyncHandler(async (req, res) => {
  const result = await authService.resetPassword({
    email: req.body.email,
    token: req.body.token,
    newPassword: req.body.newPassword,
  });
  successResponse(res, result, result.message);
});

export const googleLogin = asyncHandler(async (req, res) => {
  const result = await authService.loginWithGoogle({ idToken: req.body.idToken });
  successResponse(
    res,
    result,
    result.isNew ? 'Tạo tài khoản Google thành công' : 'Đăng nhập Google thành công',
  );
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const result = await authService.verifyEmail({ email: req.body.email, token: req.body.token });
  successResponse(res, result, result.message);
});

export const resendVerification = asyncHandler(async (req, res) => {
  const result = await authService.resendVerification({ email: req.body.email });
  successResponse(res, result, result.message);
});

// Trang HTML hiển thị khi user BẤM link trong email (request GET). Trả HTML thay vì JSON.
const verifyResultPage = (ok, message) => `<!doctype html>
<html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PBMS — Xác minh email</title></head>
<body style="font-family:Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#f1f5f9">
  <div style="background:#fff;padding:32px 40px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.08);max-width:420px;text-align:center">
    <div style="font-size:48px">${ok ? '✅' : '❌'}</div>
    <h2 style="color:${ok ? '#16a34a' : '#dc2626'};margin:12px 0">${message}</h2>
    <p style="color:#64748b">Bạn có thể đóng tab này và đăng nhập vào PBMS.</p>
  </div>
</body></html>`;

export const verifyEmailPage = async (req, res) => {
  res.removeHeader('Content-Security-Policy'); // cho phép style inline ở production
  try {
    const result = await authService.verifyEmail({ email: req.query.email, token: req.query.token });
    res.status(200).type('html').send(verifyResultPage(true, result.message));
  } catch (err) {
    res.status(400).type('html').send(verifyResultPage(false, err.message || 'Xác minh email thất bại'));
  }
};

// Trang test đăng nhập Google — CHỈ chạy ở môi trường dev (404 ở production).
// BE chưa có FE tích hợp vẫn test được API: bấm nút Google → lấy ID token thật
// → trang tự POST /api/auth/google và in response; token cũng copy được để thử trong Swagger.
const googleTestHtml = (clientId) => `<!doctype html>
<html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PBMS — Test đăng nhập Google (dev)</title>
<script src="https://accounts.google.com/gsi/client" async defer></script></head>
<body style="font-family:Arial,sans-serif;margin:0;background:#f1f5f9;min-height:100vh;display:flex;align-items:center;justify-content:center">
  <div style="background:#fff;padding:32px 40px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.08);max-width:640px;width:100%">
    <h2 style="margin-top:0">Test <code>POST /api/auth/google</code></h2>
    ${clientId
      ? `<ol style="color:#475569;font-size:14px;line-height:1.6">
          <li>Origin này (cổng của BE) phải nằm trong <b>Authorized JavaScript origins</b> của OAuth Client trên Google Cloud Console.</li>
          <li>Bấm nút Google bên dưới → trang tự gọi API và in kết quả.</li>
        </ol>
        <div id="g_id_onload" data-client_id="${clientId}" data-callback="onCredential" data-auto_prompt="false"></div>
        <div class="g_id_signin" data-type="standard" data-size="large" data-text="signin_with"></div>
        <button id="oneTapBtn" style="margin-top:8px;padding:6px 16px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc;cursor:pointer">🔔 Mở prompt One Tap thủ công (nếu nút trên bị chặn)</button>`
      : `<p style="color:#dc2626"><b>GOOGLE_CLIENT_ID</b> chưa được cấu hình trong <code>server/.env</code> — thêm rồi khởi động lại server.</p>`}
    <h3 style="margin-bottom:4px">ID token (copy để thử trong Swagger)</h3>
    <textarea id="token" rows="4" style="width:100%;box-sizing:border-box" readonly placeholder="Bấm nút Google để lấy token…"></textarea>
    <button id="copyBtn" style="margin-top:6px;padding:6px 16px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc;cursor:pointer">📋 Copy toàn bộ token</button>
    <h3 style="margin-bottom:4px">Response từ API</h3>
    <pre id="result" style="background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;overflow:auto;min-height:60px;font-size:12px">(chưa gọi)</pre>
  </div>
  <script>
    // One Tap chỉ mở khi NGƯỜI DÙNG bấm (auto_prompt=false) — prompt tự bật mà bị đóng
    // sẽ ăn án phạt cooldown của Chrome, làm trải nghiệm test cực khó chịu.
    const oneTapBtn = document.getElementById('oneTapBtn');
    if (oneTapBtn) oneTapBtn.onclick = () => {
      if (window.google?.accounts?.id) window.google.accounts.id.prompt();
      else alert('Script Google chưa tải xong — đợi 1-2 giây rồi bấm lại.');
    };
    document.getElementById('copyBtn').onclick = async () => {
      const ta = document.getElementById('token');
      if (!ta.value) { alert('Chưa có token — bấm nút Google trước.'); return; }
      ta.select();
      try { await navigator.clipboard.writeText(ta.value); } catch { document.execCommand('copy'); }
      const btn = document.getElementById('copyBtn');
      btn.textContent = '✅ Đã copy ' + ta.value.length + ' ký tự';
      setTimeout(() => { btn.textContent = '📋 Copy toàn bộ token'; }, 2500);
    };
    window.onCredential = async (resp) => {
      document.getElementById('token').value = resp.credential;
      const out = document.getElementById('result');
      out.textContent = 'Đang gọi POST /api/auth/google…';
      try {
        const r = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: resp.credential }),
        });
        out.textContent = 'HTTP ' + r.status + '\\n' + JSON.stringify(await r.json(), null, 2);
      } catch (e) {
        out.textContent = 'Lỗi gọi API: ' + e.message;
      }
    };
  </script>
</body></html>`;

export const googleTestPage = asyncHandler(async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    throw new AppError('Not found', 404, 'NOT_FOUND');
  }
  res.removeHeader('Content-Security-Policy'); // trang dev có script inline + script Google
  // Helmet mặc định đặt Referrer-Policy: no-referrer → iframe nút GSI mất header Referer,
  // Google không xác minh được origin và trả 400 "origin is not allowed". Nút Google
  // BẮT BUỘC trang nhúng phải gửi origin qua Referer.
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Helmet mặc định COOP: same-origin → popup đăng nhập mất window.opener, chọn tài khoản
  // xong không postMessage token về trang được (popup trắng). 'same-origin-allow-popups'
  // giữ bảo vệ COOP nhưng cho phép popup do trang này mở giữ liên kết ngược.
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.status(200).type('html').send(googleTestHtml(isGoogleConfigured() ? process.env.GOOGLE_CLIENT_ID : null));
});
