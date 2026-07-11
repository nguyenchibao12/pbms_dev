import { body, param, query } from 'express-validator';
import { requiredPlateNumber, optionalPlateNumber } from './plate.validator.js';

export const checkinValidator = [
  requiredPlateNumber('plateNumber'),
  body('vehicleTypeId').isInt({ min: 1 }).withMessage('vehicleTypeId is required'),
  body('floorId').isInt({ min: 1 }).withMessage('floorId is required'),
  // Optional: nếu bỏ trống, BE tự suy cổng IN duy nhất của tầng.
  body('gateId').optional().isInt({ min: 1 }),
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
  body('overstayCharge').optional().isBoolean().toBoolean(),
];

// Check-out: cần thêm cổng RA (OUT) để kiểm tra đúng tầng + ghi exit_gate_id
export const checkoutValidator = [
  ...previewFeeValidator,
  // Optional: nếu bỏ trống, BE tự suy cổng OUT duy nhất của tầng xe đang đỗ.
  body('gateId').optional().isInt({ min: 1 }),
];

export const sessionIdParam = [param('id').isInt({ min: 1 }).withMessage('Invalid session id')];

export const correctPlateValidator = [
  ...sessionIdParam,
  requiredPlateNumber('plateNumber'),
];

export const staffQrLookupValidator = [
  query('qrToken').isString().trim().notEmpty().isLength({ min: 16 }),
];
