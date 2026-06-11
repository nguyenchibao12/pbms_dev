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
} from '../validators/auth.validator.js';
import { authRateLimiter } from '../middleware/security.js';

const router = Router();

router.post('/register', authRateLimiter, registerValidator, validate, authController.register);
router.post('/login', authRateLimiter, loginValidator, validate, authController.login);
router.post('/google', authRateLimiter, googleValidator, validate, authController.googleLogin);
router.post('/forgot-password', authRateLimiter, forgotPasswordValidator, validate, authController.forgotPassword);
router.post('/reset-password', authRateLimiter, resetPasswordValidator, validate, authController.resetPassword);
router.get('/me', auth, authController.getMe);

export default router;
