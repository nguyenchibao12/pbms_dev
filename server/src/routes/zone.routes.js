import { Router } from 'express';
import * as zoneController from '../controllers/zone.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticated, managerWrite } from '../middleware/access.js';
import { zoneValidators, idParam } from '../validators/masterData.validator.js';

const router = Router();

router.get('/',
  /* #swagger.tags = ['MasterData']
     #swagger.summary = 'Danh sách khu'
     #swagger.parameters['floorId'] = { in: 'query', description: 'Lọc theo tầng', schema: { type: 'integer' } } */
  ...authenticated, zoneValidators.list, validate, zoneController.list);

router.get('/:id',
  /* #swagger.tags = ['MasterData']
     #swagger.summary = 'Chi tiết khu' */
  ...authenticated, idParam, validate, zoneController.get);

router.post(
  '/:id/slots/bulk',
  /* #swagger.tags = ['MasterData']
     #swagger.summary = 'Sinh nhiều chỗ cho khu (Manager)'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { count: 20, codePrefix: 'A-', distanceStart: 10, distanceStep: 5 } } } } */
  ...managerWrite,
  zoneValidators.bulkSlots,
  validate,
  zoneController.bulkGenerateSlots,
);

router.post('/',
  /* #swagger.tags = ['MasterData']
     #swagger.summary = 'Thêm khu (Manager)'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { floorId: 1, vehicleTypeId: 1, zoneCode: 'B1-A', label: 'Khu A', totalSlots: 0, monthlyPassCapacity: 5 } } } } */
  ...managerWrite, zoneValidators.create, validate, zoneController.create);

router.put('/:id',
  /* #swagger.tags = ['MasterData']
     #swagger.summary = 'Sửa khu (Manager)'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { label: 'Khu A mới', monthlyPassCapacity: 8 } } } } */
  ...managerWrite, zoneValidators.update, validate, zoneController.update);

router.delete('/:id',
  /* #swagger.tags = ['MasterData']
     #swagger.summary = 'Xóa khu (Manager)' */
  ...managerWrite, idParam, validate, zoneController.remove);

export default router;
