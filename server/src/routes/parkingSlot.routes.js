import { Router } from 'express';
import * as parkingSlotController from '../controllers/parkingSlot.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticated, managerWrite } from '../middleware/access.js';
import { parkingSlotValidators, idParam } from '../validators/masterData.validator.js';

const router = Router();

router.get('/', ...authenticated, parkingSlotValidators.list, validate, parkingSlotController.list);
router.get('/:id', ...authenticated, idParam, validate, parkingSlotController.get);
router.post('/', ...managerWrite, parkingSlotValidators.create, validate, parkingSlotController.create);
router.put('/:id', ...managerWrite, parkingSlotValidators.update, validate, parkingSlotController.update);
router.delete('/:id', ...managerWrite, idParam, validate, parkingSlotController.remove);

export default router;
