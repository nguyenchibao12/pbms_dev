import { Router } from 'express';
import * as gateController from '../controllers/gate.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticated, managerWrite } from '../middleware/access.js';
import { gateValidators, idParam } from '../validators/masterData.validator.js';

const router = Router();

router.get('/', ...authenticated, gateValidators.list, validate, gateController.list);
router.get('/:id', ...authenticated, idParam, validate, gateController.get);
router.post('/', ...managerWrite, gateValidators.create, validate, gateController.create);
router.put('/:id', ...managerWrite, gateValidators.update, validate, gateController.update);
router.delete('/:id', ...managerWrite, idParam, validate, gateController.remove);

export default router;
