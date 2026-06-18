import { body } from 'express-validator';
import { validateAndNormalizePlateVN } from '../utils/plateVN.js';

const plateCustom = (value, { req }, field) => {
  const result = validateAndNormalizePlateVN(value);
  if (!result.valid) throw new Error(result.error);
  req.body[field] = result.normalized;
  return true;
};

export const requiredPlateNumber = (field = 'plateNumber') =>
  body(field)
    .trim()
    .notEmpty()
    .withMessage('Biển số xe không được để trống')
    .custom((value, meta) => plateCustom(value, meta, field));

export const optionalPlateNumber = (field = 'plateNumber') =>
  body(field)
    .optional({ values: 'falsy' })
    .trim()
    .custom((value, meta) => {
      if (!value) return true;
      return plateCustom(value, meta, field);
    });
