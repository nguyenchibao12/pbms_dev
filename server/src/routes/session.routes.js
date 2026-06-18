import { Router } from 'express';
import * as sessionController from '../controllers/session.controller.js';
import { validate } from '../middleware/validate.js';
import { staffOnly, staffOrManager, authenticated, userOnly } from '../middleware/access.js';
import {
  checkinValidator,
  previewFeeValidator,
  sessionIdParam,
  correctPlateValidator,
  staffQrLookupValidator,
} from '../validators/session.validator.js';

const router = Router();

router.get('/active', ...staffOnly, sessionController.listActive);
router.get('/mine/active', ...userOnly, sessionController.listMineActive);
router.get(
  '/staff/lookup',
  ...staffOrManager,
  staffQrLookupValidator,
  validate,
  sessionController.staffLookupByQr,
);
router.get('/:id', ...authenticated, sessionIdParam, validate, sessionController.get);
router.post('/checkin', ...staffOnly, checkinValidator, validate, sessionController.checkin);
// TODO(payment): bật lại khi services/payment.service.js (module thanh toán) được merge.
// checkout phụ thuộc initiateSessionCheckout trong payment.service nên tạm chưa mount.
// router.post('/checkout', ...staffOnly, checkoutValidator, validate, sessionController.checkout);
router.post('/preview-fee', ...staffOnly, previewFeeValidator, validate, sessionController.previewFee);
router.patch('/:id/plate', ...staffOnly, correctPlateValidator, validate, sessionController.correctPlate);

export default router;
