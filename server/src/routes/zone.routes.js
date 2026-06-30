import { Router } from 'express';
import * as zoneController from '../controllers/zone.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticated, managerWrite } from '../middleware/access.js';
import { zoneValidators, idParam } from '../validators/masterData.validator.js';

const router = Router();

router.get('/',
  /* #swagger.tags = ['Zones']
     #swagger.summary = 'Danh sách khu'
     #swagger.parameters['floorId'] = { in: 'query', description: 'Lọc theo tầng', schema: { type: 'integer' } } */
  ...authenticated, zoneValidators.list, validate, zoneController.list);

router.get('/next-code',
  /* #swagger.tags = ['Zones']
     #swagger.summary = 'Xem trước mã khu sẽ sinh (theo tầng + loại xe)'
     #swagger.parameters['floorId'] = { in: 'query', required: true, schema: { type: 'integer' } }
     #swagger.parameters['vehicleTypeId'] = { in: 'query', required: true, schema: { type: 'integer' } } */
  ...authenticated, zoneValidators.nextCode, validate, zoneController.nextCode);

router.get('/:id',
  /* #swagger.tags = ['Zones']
     #swagger.summary = 'Chi tiết khu' */
  ...authenticated, idParam, validate, zoneController.get);

router.post(
  '/:id/slots/bulk',
  /* #swagger.tags = ['Zones']
     #swagger.summary = 'Sinh nhiều chỗ cho khu (Manager)'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { count: 20, codePrefix: 'A-', distanceStart: 10, distanceStep: 5 } } } } */
  ...managerWrite,
  zoneValidators.bulkSlots,
  validate,
  zoneController.bulkGenerateSlots,
);

router.post('/',
  /* #swagger.tags = ['Zones']
     #swagger.summary = 'Thêm khu (Manager) — mã khu tự sinh theo <TẦNG>-<LOẠI XE>-<NN>'
     #swagger.description = 'Mã khu do hệ thống tự sinh (không cần gửi). monthlyPassCapacity phải ≤ totalSlots. Thường tạo khu với totalSlots = 0 rồi thêm chỗ qua POST /zones/{id}/slots/bulk.'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { floorId: 1, vehicleTypeId: 1, label: 'Khu ô tô tầng 1', totalSlots: 0, monthlyPassCapacity: 0 } } } } */
  ...managerWrite, zoneValidators.create, validate, zoneController.create);

router.put('/:id',
  /* #swagger.tags = ['Zones']
     #swagger.summary = 'Sửa khu (Manager)'
     #swagger.description = 'Mã khu không sửa tay (tự sinh). monthlyPassCapacity phải ≤ totalSlots của khu.'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { label: 'Khu ô tô tầng 1 (đổi tên)', monthlyPassCapacity: 3 } } } } */
  ...managerWrite, zoneValidators.update, validate, zoneController.update);

router.delete('/:id',
  /* #swagger.tags = ['Zones']
     #swagger.summary = 'Xóa khu (Manager)' */
  ...managerWrite, idParam, validate, zoneController.remove);

export default router;
