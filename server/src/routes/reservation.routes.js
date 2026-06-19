import { Router } from 'express';
import * as reservationController from '../controllers/reservation.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticated, staffOnly, staffOrManager, userOnly } from '../middleware/access.js';
import {
  createReservationValidator,
  reservationIdParam,
  checkinReservationValidator,
  staffQrLookupValidator,
} from '../validators/reservation.validator.js';

const router = Router();

router.post('/',
  /* #swagger.tags = ['Reservations']
     #swagger.summary = 'Đặt chỗ trước (User) — tạo đơn + link thanh toán PayOS'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { plateNumber: '51F-67890', vehicleTypeId: 1, floorId: 1, startTime: '2026-06-25T09:00:00.000Z', endTime: '2026-06-25T11:00:00.000Z' } } } } */
  ...userOnly, createReservationValidator, validate, reservationController.create);
router.get('/mine',
  /* #swagger.tags = ['Reservations']
     #swagger.summary = 'Danh sách đặt chỗ của tôi (User)' */
  ...userOnly, reservationController.listMine);
router.get('/staff/upcoming',
  /* #swagger.tags = ['Reservations']
     #swagger.summary = 'Đặt chỗ sắp tới (Staff/Manager)' */
  ...staffOrManager, reservationController.listStaffUpcoming);
router.get(
  '/staff/lookup',
  /* #swagger.tags = ['Reservations']
     #swagger.summary = 'Tra cứu đặt chỗ bằng QR (Staff/Manager)'
     #swagger.parameters['qrToken'] = { in: 'query', required: true, description: 'Mã QR trên vé (≥16 ký tự)', schema: { type: 'string' } } */
  ...staffOrManager,
  staffQrLookupValidator,
  validate,
  reservationController.staffLookupByQr,
);
router.post(
  '/checkin',
  /* #swagger.tags = ['Reservations']
     #swagger.summary = 'Check-in xe đã đặt chỗ (Staff)'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { reservationId: 1, gateId: 1 } } } } */
  ...staffOnly,
  checkinReservationValidator,
  validate,
  reservationController.checkin,
);
// LƯU Ý: '/:id' (route bắt-tất) phải nằm DƯỚI mọi route chữ cụ thể như '/mine', '/staff/*', '/checkin'.
router.get('/:id',
  /* #swagger.tags = ['Reservations']
     #swagger.summary = 'Chi tiết đặt chỗ' */
  ...authenticated, reservationIdParam, validate, reservationController.get);
router.post('/:id/cancel',
  /* #swagger.tags = ['Reservations']
     #swagger.summary = 'Hủy đặt chỗ + hoàn phí (User)' */
  ...userOnly, reservationIdParam, validate, reservationController.cancel);

export default router;
