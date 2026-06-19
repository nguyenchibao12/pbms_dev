import { Router } from 'express';
import * as gateController from '../controllers/gate.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticated, managerWrite } from '../middleware/access.js';
import { gateValidators, idParam } from '../validators/masterData.validator.js';

const router = Router();

router.get('/',
  /* #swagger.tags = ['Gates']
     #swagger.summary = 'Danh sách cổng'
     #swagger.parameters['floorId'] = { in: 'query', description: 'Lọc theo tầng', schema: { type: 'integer' } } */
  ...authenticated, gateValidators.list, validate, gateController.list);

router.get('/:id',
  /* #swagger.tags = ['Gates']
     #swagger.summary = 'Chi tiết cổng' */
  ...authenticated, idParam, validate, gateController.get);

router.post('/',
  /* #swagger.tags = ['Gates']
     #swagger.summary = 'Thêm cổng (Manager)'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { floorId: 1, gateCode: 'B1-IN-CAR', direction: 'in', vehicleTypeId: 1, label: 'Cổng vào ô tô' } } } } */
  ...managerWrite, gateValidators.create, validate, gateController.create);

router.put('/:id',
  /* #swagger.tags = ['Gates']
     #swagger.summary = 'Sửa cổng (Manager)'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { isActive: true } } } } */
  ...managerWrite, gateValidators.update, validate, gateController.update);

router.delete('/:id',
  /* #swagger.tags = ['Gates']
     #swagger.summary = 'Xóa cổng (Manager)' */
  ...managerWrite, idParam, validate, gateController.remove);

export default router;
