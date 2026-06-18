import * as authService from '../services/auth.service.js';
import { asyncHandler, successResponse } from '../utils/helpers.js';

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
