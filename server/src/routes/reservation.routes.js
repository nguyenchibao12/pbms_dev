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
     #swagger.summary = 'Đặt chỗ trước (User) — tạo booking pending + link PayOS'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { plateNumber: '30A-123.45', vehicleTypeId: 1, floorId: 1, shiftId: 'morning', arrivalDate: '2026-06-20' } } } } */
  ...userOnly, createReservationValidator, validate, reservationController.create);

router.get('/mine',
  /* #swagger.tags = ['Reservations']
     #swagger.summary = 'Đặt chỗ của tôi (User)' */
  ...userOnly, reservationController.listMine);

router.get('/staff/upcoming',
  /* #swagger.tags = ['Reservations']
     #swagger.summary = 'Đặt chỗ đã xác nhận, chờ check-in (Staff/Manager)' */
  ...staffOrManager, reservationController.listStaffUpcoming);

router.get(
  '/staff/lookup',
  /* #swagger.tags = ['Reservations']
     #swagger.summary = 'Tra cứu đặt chỗ bằng mã QR (Staff/Manager)'
     #swagger.parameters['qrToken'] = { in: 'query', required: true, description: 'Mã QR trên vé đặt chỗ (≥16 ký tự)', schema: { type: 'string' } } */
  ...staffOrManager,
  staffQrLookupValidator,
  validate,
  reservationController.staffLookupByQr,
);

router.post(
  '/checkin',
  /* #swagger.tags = ['Reservations']
     #swagger.summary = 'Cho xe đặt chỗ vào bãi (Staff) — tạo session active'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { reservationId: 1, gateId: 1 } } } } */
  ...staffOnly,
  checkinReservationValidator,
  validate,
  reservationController.checkin,
);
// LƯU Ý: '/:id' (route bắt-tất) phải nằm DƯỚI mọi route chữ cụ thể như '/mine', '/staff/*', '/checkin'.
router.get('/:id',
  /* #swagger.tags = ['Reservations']
     #swagger.summary = 'Chi tiết đặt chỗ (chủ booking hoặc Staff)' */
  ...authenticated, reservationIdParam, validate, reservationController.get);

router.post('/:id/cancel',
  /* #swagger.tags = ['Reservations']
     #swagger.summary = 'Hủy đặt chỗ của tôi (User) — nhả slot + xét hoàn phí' */
  ...userOnly, reservationIdParam, validate, reservationController.cancel);

export default router;
