import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { auth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  registerValidator,
  loginValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  googleValidator,
  verifyEmailValidator,
  resendVerificationValidator,
} from '../validators/auth.validator.js';
import { authRateLimiter } from '../middleware/security.js';

const router = Router();

router.post('/register',
  /* #swagger.tags = ['Auth']
     #swagger.summary = 'Đăng ký (role User, email bắt buộc)'
     #swagger.security = []
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { username: 'khachhang01', password: 'matkhau123', fullName: 'Nguyễn Văn A', email: 'a@gmail.com', phone: '0900000000' } } } } */
  authRateLimiter, registerValidator, validate, authController.register);

router.post('/login',
  /* #swagger.tags = ['Auth']
     #swagger.summary = 'Đăng nhập (trả về token JWT)'
     #swagger.security = []
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { username: 'admin', password: 'matkhau' } } } } */
  authRateLimiter, loginValidator, validate, authController.login);

router.post('/google',
  /* #swagger.tags = ['Auth']
     #swagger.summary = 'Đăng nhập Google (ID token)'
     #swagger.security = []
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { idToken: '<google_id_token>' } } } } */
  authRateLimiter, googleValidator, validate, authController.googleLogin);

router.post('/forgot-password',
  /* #swagger.tags = ['Auth']
     #swagger.summary = 'Quên mật khẩu (gửi email link reset)'
     #swagger.security = []
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { email: 'a@gmail.com' } } } } */
  authRateLimiter, forgotPasswordValidator, validate, authController.forgotPassword);

router.post('/reset-password',
  /* #swagger.tags = ['Auth']
     #swagger.summary = 'Đặt lại mật khẩu bằng token'
     #swagger.security = []
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { email: 'a@gmail.com', token: '<token-từ-email>', newPassword: 'matkhaumoi' } } } } */
  authRateLimiter, resetPasswordValidator, validate, authController.resetPassword);

router.get('/verify-email',
  /* #swagger.tags = ['Auth']
     #swagger.summary = 'Xác minh email qua link (GET → trang HTML)'
     #swagger.security = [] */
  authController.verifyEmailPage); // bấm link trong email (GET) → trang HTML

router.post('/verify-email',
  /* #swagger.tags = ['Auth']
     #swagger.summary = 'Xác minh email bằng token (POST)'
     #swagger.security = []
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { email: 'a@gmail.com', token: '<token-từ-email>' } } } } */
  authRateLimiter, verifyEmailValidator, validate, authController.verifyEmail);

router.post('/resend-verification',
  /* #swagger.tags = ['Auth']
     #swagger.summary = 'Gửi lại email xác minh'
     #swagger.security = []
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { email: 'a@gmail.com' } } } } */
  authRateLimiter, resendVerificationValidator, validate, authController.resendVerification);

router.get('/me',
  /* #swagger.tags = ['Auth']
     #swagger.summary = 'Thông tin user hiện tại' */
  auth, authController.getMe);

export default router;
