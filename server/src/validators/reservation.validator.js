import { body, param, query } from 'express-validator';
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

export const checkinReservationValidator = [
  body('gateId').isInt({ min: 1 }).withMessage('gateId is required'),
  body('reservationId').optional().isInt({ min: 1 }),
  body('qrToken').optional().isString().notEmpty(),
  body().custom((_value, { req }) => {
    if (!req.body.reservationId && !req.body.qrToken) {
      throw new Error('Provide reservationId or qrToken');
    }
    return true;
  }),
];

export const staffQrLookupValidator = [
  query('qrToken').isString().trim().notEmpty().isLength({ min: 16 }),
];

export const suggestSlotValidator = [
  query('floorId').isInt({ min: 1 }).withMessage('floorId is required'),
  query('vehicleTypeId').isInt({ min: 1 }).withMessage('vehicleTypeId is required'),
  query('shiftId').optional().isIn(SHIFT_IDS).withMessage('Invalid shiftId'),
  query('arrivalDate').optional().isISO8601().withMessage('arrivalDate as YYYY-MM-DD'),
  query('startTime').optional().isISO8601().withMessage('startTime as ISO date'),
  query('endTime').optional().isISO8601().withMessage('endTime as ISO date'),
  query('zoneId').optional().isInt({ min: 1 }),
  query('topN').optional().isInt({ min: 1, max: 10 }),
  query().custom((_value, { req }) => {
    const hasShift = Boolean(req.query.shiftId && req.query.arrivalDate);
    const hasWindow = Boolean(req.query.startTime && req.query.endTime);
    if (!hasShift && !hasWindow) {
      throw new Error('Provide shiftId + arrivalDate, or startTime + endTime');
    }
    return true;
  }),
];

export const windowAvailabilityValidator = [
  query('floorId').isInt({ min: 1 }).withMessage('floorId is required'),
  query('vehicleTypeId').isInt({ min: 1 }).withMessage('vehicleTypeId is required'),
  query('shiftId').optional().isIn(SHIFT_IDS).withMessage('Invalid shiftId'),
  query('arrivalDate').optional().isISO8601().withMessage('arrivalDate as YYYY-MM-DD'),
  query('startTime').optional().isISO8601().withMessage('startTime as ISO date'),
  query('endTime').optional().isISO8601().withMessage('endTime as ISO date'),
  query('zoneId').optional().isInt({ min: 1 }),
  query().custom((_value, { req }) => {
    const hasShift = Boolean(req.query.shiftId && req.query.arrivalDate);
    const hasWindow = Boolean(req.query.startTime && req.query.endTime);
    if (!hasShift && !hasWindow) {
      throw new Error('Provide shiftId + arrivalDate, or startTime + endTime');
    }
    return true;
  }),
];
