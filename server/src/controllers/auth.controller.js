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
