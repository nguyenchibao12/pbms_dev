import { Router } from 'express';
import * as parkingSlotController from '../controllers/parkingSlot.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticated, managerWrite } from '../middleware/access.js';
import { parkingSlotValidators, idParam } from '../validators/masterData.validator.js';

const router = Router();

router.get('/',
  /* #swagger.tags = ['MasterData']
     #swagger.summary = 'Danh sách chỗ'
     #swagger.parameters['zoneId'] = { in: 'query', description: 'Lọc theo khu', schema: { type: 'integer' } } */
  ...authenticated, parkingSlotValidators.list, validate, parkingSlotController.list);

router.get('/:id',
  /* #swagger.tags = ['MasterData']
     #swagger.summary = 'Chi tiết chỗ' */
  ...authenticated, idParam, validate, parkingSlotController.get);

router.post('/',
  /* #swagger.tags = ['MasterData']
     #swagger.summary = 'Thêm chỗ (Manager)'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { zoneId: 1, slotCode: 'A-01', distanceToGate: 10 } } } } */
  ...managerWrite, parkingSlotValidators.create, validate, parkingSlotController.create);

router.put('/:id',
  /* #swagger.tags = ['MasterData']
     #swagger.summary = 'Sửa chỗ — gồm đổi status (Manager)'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { status: 'maintenance', distanceToGate: 12 } } } } */
  ...managerWrite, parkingSlotValidators.update, validate, parkingSlotController.update);

router.delete('/:id',
  /* #swagger.tags = ['MasterData']
     #swagger.summary = 'Xóa chỗ (Manager)' */
  ...managerWrite, idParam, validate, parkingSlotController.remove);

export default router;
