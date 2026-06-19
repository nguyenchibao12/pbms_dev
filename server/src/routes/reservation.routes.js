import { Router } from 'express';
import * as reservationController from '../controllers/reservation.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticated, userOnly } from '../middleware/access.js';
import {
  createReservationValidator,
  reservationIdParam,
} from '../validators/reservation.validator.js';

const router = Router();

router.post('/', ...userOnly, createReservationValidator, validate, reservationController.create);
router.get('/mine', ...userOnly, reservationController.listMine);
// LƯU Ý: '/:id' (route bắt-tất) phải nằm DƯỚI mọi route chữ cụ thể như '/mine'.
router.get('/:id', ...authenticated, reservationIdParam, validate, reservationController.get);

export default router;
