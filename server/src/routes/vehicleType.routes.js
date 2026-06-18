import { Router } from 'express';
import * as vehicleTypeController from '../controllers/vehicleType.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticated, managerWrite } from '../middleware/access.js';
import { vehicleTypeValidators, idParam } from '../validators/masterData.validator.js';

const router = Router();

router.get('/',
  /* #swagger.tags = ['MasterData']
     #swagger.summary = 'Danh sách loại xe' */
  ...authenticated, vehicleTypeController.list);

router.get('/:id',
  /* #swagger.tags = ['MasterData']
     #swagger.summary = 'Chi tiết loại xe' */
  ...authenticated, idParam, validate, vehicleTypeController.get);

router.post('/',
  /* #swagger.tags = ['MasterData']
     #swagger.summary = 'Thêm loại xe (Manager)'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { typeName: 'Ô tô', typeCode: 'CAR' } } } } */
  ...managerWrite, vehicleTypeValidators.create, validate, vehicleTypeController.create);

router.put('/:id',
  /* #swagger.tags = ['MasterData']
     #swagger.summary = 'Sửa loại xe (Manager)'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { typeName: 'Xe máy' } } } } */
  ...managerWrite, vehicleTypeValidators.update, validate, vehicleTypeController.update);

router.delete('/:id',
  /* #swagger.tags = ['MasterData']
     #swagger.summary = 'Xóa loại xe (Manager)' */
  ...managerWrite, idParam, validate, vehicleTypeController.remove);

export default router;
