import { body, param } from 'express-validator';

export const userIdParam = [param('id').isInt({ min: 1 }).withMessage('Invalid user id')];

export const createUserValidator = [
  body('username').trim().isLength({ min: 3, max: 50 }).withMessage('username 3–50 ký tự'),
  body('password').isLength({ min: 6 }).withMessage('password tối thiểu 6 ký tự'),
  body('fullName').trim().notEmpty().withMessage('fullName is required'),
  body('email').optional({ values: 'null' }).isEmail().withMessage('email không hợp lệ'),
  body('phone').optional().isString(),
  body('roleId').isInt({ min: 1 }).withMessage('roleId is required'),
];

export const updateUserValidator = [
  ...userIdParam,
  body('fullName').optional().trim().notEmpty(),
  body('email').optional({ values: 'null' }).isEmail(),
  body('phone').optional().isString(),
  body('roleId').optional().isInt({ min: 1 }),
  body('isActive').optional().isBoolean(),
  body('password').optional().isLength({ min: 6 }),
];
