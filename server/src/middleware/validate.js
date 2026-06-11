import { validationResult } from 'express-validator';
import { AppError } from '../utils/helpers.js';

export const validate = (req, _res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const message = errors.array().map((e) => e.msg).join(', ');
    return next(new AppError(message, 400, 'VALIDATION_ERROR'));
  }
  next();
};
