import { Router } from 'express';
import * as floorController from '../controllers/floor.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticated, managerWrite } from '../middleware/access.js';
import { floorValidators, idParam } from '../validators/masterData.validator.js';

const router = Router();

router.get('/',
  /* #swagger.tags = ['Floors']
     #swagger.summary = 'Danh sách tầng' */
  ...authenticated, floorController.list);

router.post('/setup',
  /* #swagger.tags = ['Floors']
     #swagger.summary = 'Thiết lập nhanh tầng (Manager) — floor + zone + slot + cổng'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { floor: { floorCode: 'B3', floorLevel: -3, label: 'Hầm B3' }, zones: [{ vehicleTypeId: 1, zoneCode: 'B3-A', label: 'Khu A ô tô', slotCount: 40, codePrefix: 'A-', monthlyPassCapacity: 10, distanceStart: 10, distanceStep: 5 }], gates: { auto: true } } } } } */
  ...managerWrite, floorValidators.quickSetup, validate, floorController.quickSetup);

router.get('/:id',
  /* #swagger.tags = ['Floors']
     #swagger.summary = 'Chi tiết tầng' */
  ...authenticated, idParam, validate, floorController.get);

router.post('/:id/clone',
  /* #swagger.tags = ['Floors']
     #swagger.summary = 'Nhân bản tầng (Manager)'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { floorCode: 'B4', floorLevel: -4, label: 'Hầm B4' } } } } */
  ...managerWrite, floorValidators.clone, validate, floorController.clone);

router.post('/',
  /* #swagger.tags = ['Floors']
     #swagger.summary = 'Thêm tầng (Manager)'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { floorCode: 'B3', floorLevel: -3, label: 'Hầm B3' } } } } */
  ...managerWrite, floorValidators.create, validate, floorController.create);

router.put('/:id',
  /* #swagger.tags = ['Floors']
     #swagger.summary = 'Sửa tầng (Manager)'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { label: 'Hầm B3 mới' } } } } */
  ...managerWrite, floorValidators.update, validate, floorController.update);

router.delete('/:id',
  /* #swagger.tags = ['Floors']
     #swagger.summary = 'Xóa tầng (Manager)' */
  ...managerWrite, idParam, validate, floorController.remove);

export default router;
