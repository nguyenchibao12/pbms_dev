import { body } from 'express-validator';

// Khớp với deriveUsername() trong auth.service.js (chỉ giữ a-z, 0-9, . _ -)
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]+$/;
// bcrypt chỉ băm tối đa 72 byte đầu — chặn ở đây để tránh mật khẩu bị cắt âm thầm
const PASSWORD_MAX = 72;

export const registerValidator = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Tên đăng nhập phải từ 3-50 ký tự')
    .bail()
    .matches(USERNAME_PATTERN)
    .withMessage('Tên đăng nhập chỉ gồm chữ, số và . _ -'),
  body('password')
    .isString()
    .withMessage('Mật khẩu là bắt buộc')
    .bail()
    .isLength({ min: 6, max: PASSWORD_MAX })
    .withMessage(`Mật khẩu phải từ 6-${PASSWORD_MAX} ký tự`),
  body('fullName')
    .trim()
    .notEmpty()
    .withMessage('Họ tên là bắt buộc')
    .bail()
    .isLength({ max: 100 })
    .withMessage('Họ tên tối đa 100 ký tự'),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email là bắt buộc')
    .bail()
    .isEmail()
    .withMessage('Email không hợp lệ')
    .bail()
    .isLength({ max: 100 })
    .withMessage('Email tối đa 100 ký tự'),
  body('phone')
    .optional({ values: 'falsy' })
    .trim()
    .isMobilePhone('vi-VN')
    .withMessage('Số điện thoại không hợp lệ'),
];

export const loginValidator = [
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

export const forgotPasswordValidator = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email là bắt buộc')
    .bail()
    .isEmail()
    .withMessage('Email không hợp lệ'),
];

export const resetPasswordValidator = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email là bắt buộc')
    .bail()
    .isEmail()
    .withMessage('Email không hợp lệ'),
  body('token')
    .isString()
    .withMessage('Thiếu token')
    .bail()
    .isHexadecimal()
    .isLength({ min: 64, max: 64 })
    .withMessage('Token đặt lại không hợp lệ'),
  body('newPassword')
    .isString()
    .withMessage('Mật khẩu là bắt buộc')
    .bail()
    .isLength({ min: 6, max: PASSWORD_MAX })
    .withMessage(`Mật khẩu phải từ 6-${PASSWORD_MAX} ký tự`),
];

export const googleValidator = [
  body('idToken')
    .isString()
    .withMessage('Thiếu Google idToken')
    .bail()
    .isJWT()
    .withMessage('Google idToken không hợp lệ'),
];

export const verifyEmailValidator = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email là bắt buộc')
    .bail()
    .isEmail()
    .withMessage('Email không hợp lệ'),
  body('token')
    .isString()
    .withMessage('Thiếu token')
    .bail()
    .isHexadecimal()
    .isLength({ min: 64, max: 64 })
    .withMessage('Token xác minh không hợp lệ'),
];

export const resendVerificationValidator = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email là bắt buộc')
    .bail()
    .isEmail()
    .withMessage('Email không hợp lệ'),
];
