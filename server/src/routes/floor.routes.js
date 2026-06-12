import { Router } from 'express';
import * as floorController from '../controllers/floor.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticated, managerWrite } from '../middleware/access.js';
import { floorValidators, idParam } from '../validators/masterData.validator.js';

const router = Router();

router.get('/', ...authenticated, floorController.list);
router.post('/setup', ...managerWrite, floorValidators.quickSetup, validate, floorController.quickSetup);
router.get('/:id', ...authenticated, idParam, validate, floorController.get);
router.post('/:id/clone', ...managerWrite, floorValidators.clone, validate, floorController.clone);
router.post('/', ...managerWrite, floorValidators.create, validate, floorController.create);
router.put('/:id', ...managerWrite, floorValidators.update, validate, floorController.update);
router.delete('/:id', ...managerWrite, idParam, validate, floorController.remove);

export default router;
