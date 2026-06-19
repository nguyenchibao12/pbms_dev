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

router.post('/', ...userOnly, createReservationValidator, validate, reservationController.create);
router.get('/mine', ...userOnly, reservationController.listMine);
router.get('/staff/upcoming', ...staffOrManager, reservationController.listStaffUpcoming);
router.get(
  '/staff/lookup',
  ...staffOrManager,
  staffQrLookupValidator,
  validate,
  reservationController.staffLookupByQr,
);
router.post(
  '/checkin',
  ...staffOnly,
  checkinReservationValidator,
  validate,
  reservationController.checkin,
);
// LƯU Ý: '/:id' (route bắt-tất) phải nằm DƯỚI mọi route chữ cụ thể như '/mine', '/staff/*', '/checkin'.
router.get('/:id', ...authenticated, reservationIdParam, validate, reservationController.get);
router.post('/:id/cancel', ...userOnly, reservationIdParam, validate, reservationController.cancel);

export default router;
