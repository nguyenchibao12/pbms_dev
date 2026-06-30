import { Router } from 'express';
import * as vehicleTypeController from '../controllers/vehicleType.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticated, managerWrite } from '../middleware/access.js';
import { vehicleTypeValidators, idParam } from '../validators/masterData.validator.js';

const router = Router();

router.get('/',
  /* #swagger.tags = ['Vehicle Types']
     #swagger.summary = 'Danh sách loại xe' */
  ...authenticated, vehicleTypeController.list);

router.get('/:id',
  /* #swagger.tags = ['Vehicle Types']
     #swagger.summary = 'Chi tiết loại xe' */
  ...authenticated, idParam, validate, vehicleTypeController.get);

router.post('/',
  /* #swagger.tags = ['Vehicle Types']
     #swagger.summary = 'Thêm loại xe (Manager)'
     #swagger.description = 'typeCode tự chuyển CHỮ HOA. slotAreaM2 = diện tích 1 chỗ (m², gộp lối đi) — dùng tính sức chứa tầng theo diện tích.'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { typeName: 'Ô tô', typeCode: 'CAR', slotAreaM2: 12.5 } } } } */
  ...managerWrite, vehicleTypeValidators.create, validate, vehicleTypeController.create);

router.put('/:id',
  /* #swagger.tags = ['Vehicle Types']
     #swagger.summary = 'Sửa loại xe (Manager)'
     #swagger.description = 'Mọi field optional. typeCode tự chuyển CHỮ HOA.'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { typeName: 'Xe máy', typeCode: 'BIKE', slotAreaM2: 2.5 } } } } */
  ...managerWrite, vehicleTypeValidators.update, validate, vehicleTypeController.update);

router.delete('/:id',
  /* #swagger.tags = ['Vehicle Types']
     #swagger.summary = 'Xóa loại xe (Manager)' */
  ...managerWrite, idParam, validate, vehicleTypeController.remove);

export default router;
