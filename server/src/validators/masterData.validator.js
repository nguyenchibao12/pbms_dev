import { body, param, query } from 'express-validator';
import { SLOT_STATUSES } from '../models/parkingSlot.model.js';

export const idParam = [param('id').isInt({ min: 1 }).withMessage('Invalid id')];

export const floorValidators = {
  create: [
    body('floorCode')
      .trim()
      .notEmpty().withMessage('Mã tầng không được để trống')
      .bail()
      .isLength({ max: 20 }).withMessage('Mã tầng tối đa 20 ký tự'),
    body('floorLevel')
      .notEmpty().withMessage('Số tầng không được để trống')
      .bail()
      .isInt({ min: -50, max: 200 }).withMessage('Số tầng phải là số nguyên trong khoảng -50..200')
      .toInt(),
    body('label')
      .trim()
      .notEmpty().withMessage('Tên tầng không được để trống')
      .bail()
      .isLength({ max: 100 }).withMessage('Tên tầng tối đa 100 ký tự'),
  ],
  update: [
    ...idParam,
    body('floorCode')
      .optional()
      .trim()
      .notEmpty().withMessage('Mã tầng không được để trống')
      .bail()
      .isLength({ max: 20 }).withMessage('Mã tầng tối đa 20 ký tự'),
    body('floorLevel')
      .optional()
      .isInt({ min: -50, max: 200 }).withMessage('Số tầng phải là số nguyên trong khoảng -50..200')
      .toInt(),
    body('label')
      .optional()
      .trim()
      .notEmpty().withMessage('Tên tầng không được để trống')
      .bail()
      .isLength({ max: 100 }).withMessage('Tên tầng tối đa 100 ký tự'),
  ],
  quickSetup: [
    body('floor.floorCode')
      .trim()
      .notEmpty().withMessage('Mã tầng không được để trống')
      .bail()
      .isLength({ max: 20 }).withMessage('Mã tầng tối đa 20 ký tự'),
    body('floor.floorLevel')
      .isInt({ min: -50, max: 200 }).withMessage('Số tầng phải là số nguyên trong khoảng -50..200')
      .toInt(),
    body('floor.label')
      .trim()
      .notEmpty().withMessage('Tên tầng không được để trống')
      .bail()
      .isLength({ max: 100 }).withMessage('Tên tầng tối đa 100 ký tự'),
    body('zones').isArray({ min: 1 }).withMessage('zones must be a non-empty array'),
    body('zones.*.vehicleTypeId').isInt({ min: 1 }),
    body('zones.*.zoneCode').trim().notEmpty(),
    body('zones.*.label').trim().notEmpty(),
    body('zones.*.slotCount').isInt({ min: 1, max: 500 }),
    body('zones.*.codePrefix').trim().notEmpty(),
    body('zones.*.monthlyPassCapacity').optional().isInt({ min: 0 }),
    body('zones.*.startIndex').optional().isInt({ min: 1 }),
    body('zones.*.padding').optional().isInt({ min: 1, max: 4 }),
    body('zones.*.distanceStart').optional().isFloat({ min: 0 }),
    body('zones.*.distanceStep').optional().isFloat({ min: 0 }),
    body('gates.auto').optional().isBoolean(),
  ],
  clone: [
    ...idParam,
    body('floorCode')
      .trim()
      .notEmpty().withMessage('Mã tầng không được để trống')
      .bail()
      .isLength({ max: 20 }).withMessage('Mã tầng tối đa 20 ký tự'),
    body('floorLevel')
      .isInt({ min: -50, max: 200 }).withMessage('Số tầng phải là số nguyên trong khoảng -50..200')
      .toInt(),
    body('label')
      .trim()
      .notEmpty().withMessage('Tên tầng không được để trống')
      .bail()
      .isLength({ max: 100 }).withMessage('Tên tầng tối đa 100 ký tự'),
  ],
};

export const zoneValidators = {
  list: [query('floorId').optional().isInt({ min: 1 })],
  bulkSlots: [
    ...idParam,
    body('count').isInt({ min: 1, max: 500 }).withMessage('count must be 1..500'),
    body('codePrefix').trim().notEmpty().withMessage('codePrefix is required'),
    body('startIndex').optional().isInt({ min: 1 }),
    body('padding').optional().isInt({ min: 1, max: 4 }),
    body('distanceStart').optional().isFloat({ min: 0 }),
    body('distanceStep').optional().isFloat({ min: 0 }),
    body('distanceElevatorStart').optional().isFloat({ min: 0 }),
    body('distanceElevatorStep').optional().isFloat({ min: 0 }),
    body('slotType').optional().isString(),
  ],
  create: [
    body('floorId').isInt({ min: 1 }).withMessage('floorId is required'),
    body('vehicleTypeId').isInt({ min: 1 }).withMessage('vehicleTypeId is required'),
    body('zoneCode').trim().notEmpty().withMessage('zoneCode is required'),
    body('label').trim().notEmpty().withMessage('label is required'),
    body('totalSlots').optional().isInt({ min: 0 }),
    body('monthlyPassCapacity').optional().isInt({ min: 0 }).withMessage('OR-03 capacity >= 0'),
  ],
  update: [
    ...idParam,
    body('floorId').optional().isInt({ min: 1 }),
    body('vehicleTypeId').optional().isInt({ min: 1 }),
    body('zoneCode').optional().trim().notEmpty(),
    body('label').optional().trim().notEmpty(),
    body('totalSlots').optional().isInt({ min: 0 }),
    body('monthlyPassCapacity').optional().isInt({ min: 0 }),
  ],
};

export const parkingSlotValidators = {
  list: [query('zoneId').optional().isInt({ min: 1 })],
  create: [
    body('zoneId').isInt({ min: 1 }).withMessage('zoneId is required'),
    body('slotCode').trim().notEmpty().withMessage('slotCode is required'),
    body('status').optional().isIn(['available', 'maintenance', 'locked']),
    body('slotType').optional().isString(),
    body('distanceToGate').optional().isFloat({ min: 0 }),
    body('distanceToElevator').optional().isFloat({ min: 0 }),
  ],
  update: [
    ...idParam,
    body('zoneId').optional().isInt({ min: 1 }),
    body('slotCode').optional().trim().notEmpty(),
    body('status').optional().isIn(SLOT_STATUSES),
    body('slotType').optional().isString(),
    body('distanceToGate').optional().isFloat({ min: 0 }),
    body('distanceToElevator').optional().isFloat({ min: 0 }),
  ],
};

export const gateValidators = {
  list: [query('floorId').optional().isInt({ min: 1 })],
  create: [
    body('floorId').isInt({ min: 1 }).withMessage('floorId is required'),
    body('gateCode').trim().notEmpty().withMessage('gateCode is required'),
    body('direction').isIn(['in', 'out']).withMessage('direction must be in or out'),
    body('vehicleTypeId').optional({ values: 'null' }).isInt({ min: 1 }),
    body('label').optional().trim().isString(),
    body('isActive').optional().isBoolean(),
  ],
  update: [
    ...idParam,
    body('floorId').optional().isInt({ min: 1 }),
    body('gateCode').optional().trim().notEmpty(),
    body('direction').optional().isIn(['in', 'out']),
    body('vehicleTypeId').optional({ values: 'null' }).isInt({ min: 1 }),
    body('label').optional().trim().isString(),
    body('isActive').optional().isBoolean(),
  ],
};

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

export const pricingRuleValidators = {
  list: [query('vehicleTypeId').optional().isInt({ min: 1 })],
  create: [
    body('vehicleTypeId').isInt({ min: 1 }).withMessage('vehicleTypeId is required'),
    body('unit').isInt({ min: 1 }).withMessage('unit (minutes) is required'),
    body('baseRate').isFloat({ min: 0 }).withMessage('baseRate is required'),
    body('effectiveFrom').isISO8601().withMessage('effectiveFrom is required'),
    body('effectiveTo').optional({ values: 'null' }).isISO8601(),
  ],
  update: [
    ...idParam,
    body('vehicleTypeId').optional().isInt({ min: 1 }),
    body('unit').optional().isInt({ min: 1 }),
    body('baseRate').optional().isFloat({ min: 0 }),
    body('effectiveFrom').optional().isISO8601(),
    body('effectiveTo').optional({ values: 'null' }).isISO8601(),
  ],
};
