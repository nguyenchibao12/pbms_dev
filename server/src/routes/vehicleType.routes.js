import { Router } from 'express';
import * as vehicleTypeController from '../controllers/vehicleType.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticated, managerWrite } from '../middleware/access.js';
import { vehicleTypeValidators, idParam } from '../validators/masterData.validator.js';

const router = Router();

router.get('/', ...authenticated, vehicleTypeController.list);
router.get('/:id', ...authenticated, idParam, validate, vehicleTypeController.get);
router.post('/', ...managerWrite, vehicleTypeValidators.create, validate, vehicleTypeController.create);
router.put('/:id', ...managerWrite, vehicleTypeValidators.update, validate, vehicleTypeController.update);
router.delete('/:id', ...managerWrite, idParam, validate, vehicleTypeController.remove);

export default router;
