import { body, param, query } from 'express-validator';
import { SLOT_STATUSES } from '../models/parkingSlot.model.js';

export const idParam = [param('id').isInt({ min: 1 }).withMessage('Invalid id')];

export const gateScanValidator = [
  body('gateId').isInt({ min: 1 }).withMessage('gateId is required'),
  body('qrToken').isString().trim().notEmpty().withMessage('qrToken is required'),
];

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
  list: [
    query('floorId').optional().isInt({ min: 1 }).withMessage('floorId phải là số nguyên dương').toInt(),
  ],
  bulkSlots: [
    ...idParam,
    body('count')
      .isInt({ min: 1, max: 500 }).withMessage('Số lượng chỗ (count) phải là số nguyên trong khoảng 1..500')
      .toInt(),
    body('codePrefix')
      .trim()
      .notEmpty().withMessage('Tiền tố mã chỗ (codePrefix) không được để trống')
      .bail()
      .isLength({ max: 16 }).withMessage('Tiền tố mã chỗ tối đa 16 ký tự'),
    body('startIndex').optional().isInt({ min: 1 }).withMessage('startIndex phải là số nguyên ≥ 1').toInt(),
    body('padding').optional().isInt({ min: 1, max: 4 }).withMessage('padding phải trong khoảng 1..4').toInt(),
    body('distanceStart').optional().isFloat({ min: 0 }).withMessage('distanceStart phải là số ≥ 0').toFloat(),
    body('distanceStep').optional().isFloat({ min: 0 }).withMessage('distanceStep phải là số ≥ 0').toFloat(),
    body('distanceElevatorStart').optional().isFloat({ min: 0 }).withMessage('distanceElevatorStart phải là số ≥ 0').toFloat(),
    body('distanceElevatorStep').optional().isFloat({ min: 0 }).withMessage('distanceElevatorStep phải là số ≥ 0').toFloat(),
    body('slotType').optional().trim().isLength({ max: 50 }).withMessage('slotType tối đa 50 ký tự'),
  ],
  create: [
    body('floorId').isInt({ min: 1 }).withMessage('floorId không hợp lệ (số nguyên dương)').toInt(),
    body('vehicleTypeId').isInt({ min: 1 }).withMessage('vehicleTypeId không hợp lệ (số nguyên dương)').toInt(),
    body('zoneCode')
      .trim()
      .notEmpty().withMessage('Mã khu không được để trống')
      .bail()
      .isLength({ max: 20 }).withMessage('Mã khu tối đa 20 ký tự'),
    body('label')
      .trim()
      .notEmpty().withMessage('Tên khu không được để trống')
      .bail()
      .isLength({ max: 100 }).withMessage('Tên khu tối đa 100 ký tự'),
    body('totalSlots').optional().isInt({ min: 0 }).withMessage('Tổng số chỗ phải là số nguyên ≥ 0').toInt(),
    body('monthlyPassCapacity').optional().isInt({ min: 0 }).withMessage('Hạn mức vé tháng phải là số nguyên ≥ 0 (OR-03)').toInt(),
  ],
  update: [
    ...idParam,
    body('floorId').optional().isInt({ min: 1 }).withMessage('floorId không hợp lệ (số nguyên dương)').toInt(),
    body('vehicleTypeId').optional().isInt({ min: 1 }).withMessage('vehicleTypeId không hợp lệ (số nguyên dương)').toInt(),
    body('zoneCode')
      .optional()
      .trim()
      .notEmpty().withMessage('Mã khu không được để trống')
      .bail()
      .isLength({ max: 20 }).withMessage('Mã khu tối đa 20 ký tự'),
    body('label')
      .optional()
      .trim()
      .notEmpty().withMessage('Tên khu không được để trống')
      .bail()
      .isLength({ max: 100 }).withMessage('Tên khu tối đa 100 ký tự'),
    body('totalSlots').optional().isInt({ min: 0 }).withMessage('Tổng số chỗ phải là số nguyên ≥ 0').toInt(),
    body('monthlyPassCapacity').optional().isInt({ min: 0 }).withMessage('Hạn mức vé tháng phải là số nguyên ≥ 0 (OR-03)').toInt(),
  ],
};

export const parkingSlotValidators = {
  list: [
    query('zoneId').optional().isInt({ min: 1 }).withMessage('zoneId phải là số nguyên dương').toInt(),
  ],
  create: [
    body('zoneId').isInt({ min: 1 }).withMessage('zoneId không hợp lệ (số nguyên dương)').toInt(),
    body('slotCode')
      .trim()
      .notEmpty().withMessage('Mã chỗ không được để trống')
      .bail()
      .isLength({ max: 20 }).withMessage('Mã chỗ tối đa 20 ký tự'),
    body('status')
      .optional()
      .isIn(['available', 'maintenance', 'locked'])
      .withMessage('Trạng thái khi tạo chỉ nhận: available | maintenance | locked'),
    body('slotType').optional().trim().isLength({ max: 50 }).withMessage('Loại chỗ (slotType) tối đa 50 ký tự'),
    body('distanceToGate').optional().isFloat({ min: 0 }).withMessage('Khoảng cách tới cổng phải là số ≥ 0').toFloat(),
    body('distanceToElevator').optional().isFloat({ min: 0 }).withMessage('Khoảng cách tới thang máy phải là số ≥ 0').toFloat(),
  ],
  update: [
    ...idParam,
    body('zoneId').optional().isInt({ min: 1 }).withMessage('zoneId không hợp lệ (số nguyên dương)').toInt(),
    body('slotCode')
      .optional()
      .trim()
      .notEmpty().withMessage('Mã chỗ không được để trống')
      .bail()
      .isLength({ max: 20 }).withMessage('Mã chỗ tối đa 20 ký tự'),
    body('status')
      .optional()
      .isIn(SLOT_STATUSES)
      .withMessage(`Trạng thái phải là một trong: ${SLOT_STATUSES.join(', ')}`),
    body('slotType').optional().trim().isLength({ max: 50 }).withMessage('Loại chỗ (slotType) tối đa 50 ký tự'),
    body('distanceToGate').optional().isFloat({ min: 0 }).withMessage('Khoảng cách tới cổng phải là số ≥ 0').toFloat(),
    body('distanceToElevator').optional().isFloat({ min: 0 }).withMessage('Khoảng cách tới thang máy phải là số ≥ 0').toFloat(),
  ],
};

export const gateValidators = {
  list: [
    query('floorId').optional().isInt({ min: 1 }).withMessage('floorId phải là số nguyên dương').toInt(),
  ],
  create: [
    body('floorId').optional({ values: 'null' }).isInt({ min: 1 })
      .withMessage('floorId phải là số (bỏ trống = cổng cấp tòa nhà)').toInt(),
    body('gateCode')
      .trim()
      .notEmpty().withMessage('Mã cổng không được để trống')
      .bail()
      .isLength({ max: 20 }).withMessage('Mã cổng tối đa 20 ký tự'),
    body('direction').isIn(['in', 'out']).withMessage('Hướng cổng chỉ nhận: in (vào) hoặc out (ra)'),
    body('vehicleTypeId')
      .optional({ values: 'null' })
      .isInt({ min: 1 }).withMessage('vehicleTypeId không hợp lệ (số nguyên dương, hoặc null = mọi loại xe)')
      .toInt(),
    body('label').optional().trim().isLength({ max: 80 }).withMessage('Tên cổng tối đa 80 ký tự'),
    body('isActive').optional().isBoolean().withMessage('isActive phải là true/false').toBoolean(),
  ],
  update: [
    ...idParam,
    body('floorId').optional().isInt({ min: 1 }).withMessage('floorId không hợp lệ (số nguyên dương)').toInt(),
    body('gateCode')
      .optional()
      .trim()
      .notEmpty().withMessage('Mã cổng không được để trống')
      .bail()
      .isLength({ max: 20 }).withMessage('Mã cổng tối đa 20 ký tự'),
    body('direction').optional().isIn(['in', 'out']).withMessage('Hướng cổng chỉ nhận: in (vào) hoặc out (ra)'),
    body('vehicleTypeId')
      .optional({ values: 'null' })
      .isInt({ min: 1 }).withMessage('vehicleTypeId không hợp lệ (số nguyên dương, hoặc null = mọi loại xe)')
      .toInt(),
    body('label').optional().trim().isLength({ max: 80 }).withMessage('Tên cổng tối đa 80 ký tự'),
    body('isActive').optional().isBoolean().withMessage('isActive phải là true/false').toBoolean(),
  ],
};

export const vehicleTypeValidators = {
  create: [
    body('typeName')
      .trim()
      .notEmpty().withMessage('Tên loại xe không được để trống')
      .bail()
      .isLength({ max: 50 }).withMessage('Tên loại xe tối đa 50 ký tự'),
    body('typeCode')
      .trim()
      .notEmpty().withMessage('Mã loại xe không được để trống')
      .bail()
      .isLength({ max: 20 }).withMessage('Mã loại xe tối đa 20 ký tự'),
  ],
  update: [
    ...idParam,
    body('typeName')
      .optional()
      .trim()
      .notEmpty().withMessage('Tên loại xe không được để trống')
      .bail()
      .isLength({ max: 50 }).withMessage('Tên loại xe tối đa 50 ký tự'),
    body('typeCode')
      .optional()
      .trim()
      .notEmpty().withMessage('Mã loại xe không được để trống')
      .bail()
      .isLength({ max: 20 }).withMessage('Mã loại xe tối đa 20 ký tự'),
  ],
};

export const pricingRuleValidators = {
  list: [
    query('vehicleTypeId').optional().isInt({ min: 1 }).withMessage('vehicleTypeId phải là số nguyên dương').toInt(),
  ],
  create: [
    body('vehicleTypeId').isInt({ min: 1 }).withMessage('vehicleTypeId không hợp lệ (số nguyên dương)').toInt(),
    body('unit').isInt({ min: 1 }).withMessage('Đơn vị tính phí (phút) phải là số nguyên ≥ 1').toInt(),
    body('baseRate').isFloat({ min: 0 }).withMessage('Đơn giá phải là số ≥ 0').toFloat(),
    body('effectiveFrom').isISO8601().withMessage('Ngày hiệu lực (effectiveFrom) phải đúng định dạng ISO8601').toDate(),
    body('effectiveTo')
      .optional({ values: 'null' })
      .isISO8601().withMessage('Ngày hết hiệu lực (effectiveTo) phải đúng định dạng ISO8601')
      .toDate(),
  ],
  update: [
    ...idParam,
    body('vehicleTypeId').optional().isInt({ min: 1 }).withMessage('vehicleTypeId không hợp lệ (số nguyên dương)').toInt(),
    body('unit').optional().isInt({ min: 1 }).withMessage('Đơn vị tính phí (phút) phải là số nguyên ≥ 1').toInt(),
    body('baseRate').optional().isFloat({ min: 0 }).withMessage('Đơn giá phải là số ≥ 0').toFloat(),
    body('effectiveFrom').optional().isISO8601().withMessage('Ngày hiệu lực (effectiveFrom) phải đúng định dạng ISO8601').toDate(),
    body('effectiveTo')
      .optional({ values: 'null' })
      .isISO8601().withMessage('Ngày hết hiệu lực (effectiveTo) phải đúng định dạng ISO8601')
      .toDate(),
  ],
};
