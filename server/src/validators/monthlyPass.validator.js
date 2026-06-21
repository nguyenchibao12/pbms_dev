import { body, param } from 'express-validator';
import { requiredPlateNumber } from './plate.validator.js';

export const purchasePassValidator = [
  requiredPlateNumber('plateNumber'),
  body('vehicleTypeId').isInt({ min: 1 }).toInt().withMessage('vehicleTypeId is required'),
  body('floorId').isInt({ min: 1 }).toInt().withMessage('floorId is required'),
  body('startDate').isISO8601().withMessage('startDate is required'),
  // Vé tháng cố định 1 tháng + khung giờ theo giờ mở cửa tòa — server tự tính.
  // Các field dưới (nếu client còn gửi) được chấp nhận nhưng bị bỏ qua.
  body('endDate').optional().isISO8601(),
  body('validFromTime').optional().matches(/^\d{2}:\d{2}$/),
  body('validToTime').optional().matches(/^\d{2}:\d{2}$/),
];

export const passIdParam = [param('id').isInt({ min: 1 }).withMessage('Invalid pass id')];
