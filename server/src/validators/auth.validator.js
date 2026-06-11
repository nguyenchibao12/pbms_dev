import { body } from 'express-validator';

export const registerValidator = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be 3-50 characters'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  body('fullName').trim().notEmpty().withMessage('Full name is required'),
  body('email').trim().notEmpty().withMessage('Email là bắt buộc').bail().isEmail().withMessage('Email không hợp lệ'),
  body('phone').optional({ values: 'falsy' }).isString(),
];

export const loginValidator = [
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

export const forgotPasswordValidator = [
  body('email').trim().notEmpty().withMessage('Email là bắt buộc').bail().isEmail().withMessage('Email không hợp lệ'),
];

export const resetPasswordValidator = [
  body('email').trim().notEmpty().bail().isEmail().withMessage('Email không hợp lệ'),
  body('token').isString().notEmpty().withMessage('Thiếu token'),
  body('newPassword').isLength({ min: 6 }).withMessage('Mật khẩu tối thiểu 6 ký tự'),
];

export const googleValidator = [
  body('idToken').isString().notEmpty().withMessage('Thiếu Google idToken'),
];
