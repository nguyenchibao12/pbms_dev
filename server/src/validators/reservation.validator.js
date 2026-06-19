import { body, param } from 'express-validator';
import { requiredPlateNumber } from './plate.validator.js';
import { SHIFT_IDS } from '../utils/shifts.js';

// Đặt chỗ theo CA cố định (shiftId + arrivalDate) HOẶC khung tuyệt đối (startTime/endTime).
const requireShiftOrWindow = body().custom((_value, { req }) => {
  const hasShift = Boolean(req.body.shiftId && req.body.arrivalDate);
  const hasWindow = Boolean(req.body.startTime && req.body.endTime);
  if (!hasShift && !hasWindow) {
    throw new Error('Provide shiftId + arrivalDate, or startTime + endTime');
  }
  return true;
});

export const createReservationValidator = [
  requiredPlateNumber('plateNumber'),
  body('vehicleTypeId').isInt({ min: 1 }).withMessage('vehicleTypeId is required'),
  body('floorId').isInt({ min: 1 }).withMessage('floorId is required'),
  body('shiftId').optional().isIn(SHIFT_IDS).withMessage('Invalid shiftId'),
  body('arrivalDate').optional().isISO8601().withMessage('arrivalDate as YYYY-MM-DD'),
  body('startTime').optional().isISO8601().withMessage('startTime as ISO date'),
  body('endTime').optional().isISO8601().withMessage('endTime as ISO date'),
  body('zoneId').optional().isInt({ min: 1 }),
  body('reservationType').optional().isString(),
  requireShiftOrWindow,
];

export const reservationIdParam = [
  param('id').isInt({ min: 1 }).withMessage('Invalid reservation id'),
];
