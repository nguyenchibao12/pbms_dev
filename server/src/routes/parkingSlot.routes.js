import { Router } from 'express';
import * as parkingSlotController from '../controllers/parkingSlot.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticated, managerWrite } from '../middleware/access.js';
import { parkingSlotValidators, idParam } from '../validators/masterData.validator.js';

const router = Router();

router.get('/',
  /* #swagger.tags = ['Parking Slots']
     #swagger.summary = 'Danh sách chỗ'
     #swagger.parameters['zoneId'] = { in: 'query', description: 'Lọc theo khu', schema: { type: 'integer' } } */
  ...authenticated, parkingSlotValidators.list, validate, parkingSlotController.list);

router.get('/next-code',
  /* #swagger.tags = ['Parking Slots']
     #swagger.summary = 'Xem trước mã chỗ sẽ sinh cho khu'
     #swagger.parameters['zoneId'] = { in: 'query', required: true, schema: { type: 'integer' } } */
  ...authenticated, parkingSlotValidators.nextCode, validate, parkingSlotController.nextCode);

router.get('/:id',
  /* #swagger.tags = ['Parking Slots']
     #swagger.summary = 'Chi tiết chỗ' */
  ...authenticated, idParam, validate, parkingSlotController.get);

router.post('/',
  /* #swagger.tags = ['Parking Slots']
     #swagger.summary = 'Thêm chỗ (Manager) — mã chỗ tự sinh theo <mã khu>-NN'
     #swagger.description = 'Mã chỗ do hệ thống sinh (không gửi slotCode). Khu phải còn trống (used < total_slots).'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { zoneId: 1, distanceToGate: 10 } } } } */
  ...managerWrite, parkingSlotValidators.create, validate, parkingSlotController.create);

router.put('/:id',
  /* #swagger.tags = ['Parking Slots']
     #swagger.summary = 'Sửa chỗ — gồm đổi status (Manager)'
     #swagger.description = 'Mã chỗ không sửa tay; nếu chuyển khu (zoneId) mã sẽ sinh lại theo mã khu mới.'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { status: 'maintenance', distanceToGate: 12 } } } } */
  ...managerWrite, parkingSlotValidators.update, validate, parkingSlotController.update);

router.delete('/:id',
  /* #swagger.tags = ['Parking Slots']
     #swagger.summary = 'Xóa chỗ (Manager)' */
  ...managerWrite, idParam, validate, parkingSlotController.remove);

export default router;
