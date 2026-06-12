import { Router } from 'express';
import * as zoneController from '../controllers/zone.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticated, managerWrite } from '../middleware/access.js';
import { zoneValidators, idParam } from '../validators/masterData.validator.js';

const router = Router();

router.get('/', ...authenticated, zoneValidators.list, validate, zoneController.list);
router.get('/:id', ...authenticated, idParam, validate, zoneController.get);
router.post(
  '/:id/slots/bulk',
  ...managerWrite,
  zoneValidators.bulkSlots,
  validate,
  zoneController.bulkGenerateSlots,
);
router.post('/', ...managerWrite, zoneValidators.create, validate, zoneController.create);
router.put('/:id', ...managerWrite, zoneValidators.update, validate, zoneController.update);
router.delete('/:id', ...managerWrite, idParam, validate, zoneController.remove);

export default router;
