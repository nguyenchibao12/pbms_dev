import { body, param } from 'express-validator';

// Tên đăng nhập: chỉ chữ/số và . _ - (khớp deriveUsername bên auth).
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

export const userIdParam = [param('id').isInt({ min: 1 }).withMessage('ID người dùng không hợp lệ')];

export const createUserValidator = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 50 }).withMessage('Tên đăng nhập 3–50 ký tự')
    .matches(USERNAME_PATTERN).withMessage('Tên đăng nhập chỉ gồm chữ, số và . _ -'),
  body('password')
    .isLength({ min: 6, max: 72 }).withMessage('Mật khẩu 6–72 ký tự'),
  body('fullName')
    .trim()
    .notEmpty().withMessage('Vui lòng nhập họ tên')
    .isLength({ max: 100 }).withMessage('Họ tên tối đa 100 ký tự'),
  // Email: tùy chọn, nhưng nếu có phải đúng định dạng.
  body('email')
    .optional({ values: 'falsy' })
    .trim()
    .isEmail().withMessage('Email không hợp lệ')
    .isLength({ max: 100 }).withMessage('Email tối đa 100 ký tự'),
  // SĐT: BẮT BUỘC + đúng định dạng di động VN.
  body('phone')
    .trim()
    .notEmpty().withMessage('Vui lòng nhập số điện thoại').bail()
    .isMobilePhone('vi-VN').withMessage('Số điện thoại không hợp lệ (VD: 0901234567)'),
  body('roleId')
    .isInt({ min: 1 }).withMessage('Vui lòng chọn vai trò'),
];

export const updateUserValidator = [
  ...userIdParam,
  body('fullName')
    .optional()
    .trim()
    .notEmpty().withMessage('Họ tên không được để trống')
    .isLength({ max: 100 }).withMessage('Họ tên tối đa 100 ký tự'),
  body('email')
    .optional({ values: 'falsy' })
    .trim()
    .isEmail().withMessage('Email không hợp lệ')
    .isLength({ max: 100 }).withMessage('Email tối đa 100 ký tự'),
  // Sửa: SĐT nếu có gửi thì phải hợp lệ (không ép bắt buộc để cho phép patch từng phần).
  body('phone')
    .optional({ values: 'falsy' })
    .trim()
    .isMobilePhone('vi-VN').withMessage('Số điện thoại không hợp lệ (VD: 0901234567)'),
  body('roleId').optional().isInt({ min: 1 }).withMessage('Vai trò không hợp lệ'),
  body('isActive').optional().isBoolean().withMessage('Trạng thái không hợp lệ'),
  body('password').optional().isLength({ min: 6, max: 72 }).withMessage('Mật khẩu 6–72 ký tự'),
];
