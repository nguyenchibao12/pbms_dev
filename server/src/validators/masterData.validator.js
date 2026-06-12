import { body, param } from 'express-validator';

export const idParam = [param('id').isInt({ min: 1 }).withMessage('Invalid id')];

export const vehicleTypeValidators = {
  create: [
    body('typeName').trim().notEmpty().withMessage('typeName is required'),
    body('typeCode').trim().notEmpty().withMessage('typeCode is required'),
  ],
  update: [
    ...idParam,
    body('typeName').optional().trim().notEmpty(),
    body('typeCode').optional().trim().notEmpty(),
  ],
};
