import { body, param, query } from 'express-validator';
import { requiredPlateNumber, optionalPlateNumber } from './plate.validator.js';

export const checkinValidator = [
  requiredPlateNumber('plateNumber'),
  body('vehicleTypeId').isInt({ min: 1 }).withMessage('vehicleTypeId is required'),
  body('floorId').isInt({ min: 1 }).withMessage('floorId is required'),
  body('gateId').isInt({ min: 1 }).withMessage('gateId is required'),
  body('zoneId').optional().isInt({ min: 1 }),
  body('userId').optional().isInt({ min: 1 }),
];

// Preview phí: chỉ cần định danh phiên (chưa cần cổng ra)
export const previewFeeValidator = [
  body('sessionId').optional().isInt({ min: 1 }),
  body('qrToken').optional().isString().notEmpty(),
  optionalPlateNumber('plateNumber'),
  body().custom((_value, { req }) => {
    if (!req.body.sessionId && !req.body.qrToken && !req.body.plateNumber) {
      throw new Error('Provide sessionId, qrToken, or plateNumber');
    }
    return true;
  }),
  body('lostTicket').optional().isBoolean().toBoolean(),
  body('lostTicketFee').optional().isInt({ min: 0 }),
];

// Check-out: cần thêm cổng RA (OUT) để kiểm tra đúng tầng + ghi exit_gate_id
export const checkoutValidator = [
  ...previewFeeValidator,
  body('gateId').isInt({ min: 1 }).withMessage('gateId (cổng ra) is required'),
];

export const sessionIdParam = [param('id').isInt({ min: 1 }).withMessage('Invalid session id')];

export const correctPlateValidator = [
  ...sessionIdParam,
  requiredPlateNumber('plateNumber'),
];

export const staffQrLookupValidator = [
  query('qrToken').isString().trim().notEmpty().isLength({ min: 16 }),
];
