import { Router } from 'express';
import * as incidentController from '../controllers/incident.controller.js';
import { validate } from '../middleware/validate.js';
import { staffOnly, staffOrManagerOrAdmin, managerOrAdmin } from '../middleware/access.js';
import {
  incidentListValidator,
  incidentCreateValidator,
  incidentStatusValidator,
} from '../validators/incident.validator.js';

const router = Router();

router.get('/',
  /* #swagger.tags = ['Incidents']
     #swagger.summary = 'Danh sách sự cố — Staff chỉ thấy của mình, Manager/Admin thấy tất cả'
     #swagger.parameters['status'] = { in: 'query', description: 'open | investigating | resolved', schema: { type: 'string' } }
     #swagger.parameters['type'] = { in: 'query', description: 'Lọc theo loại sự cố', schema: { type: 'string' } }
     #swagger.parameters['page'] = { in: 'query', description: 'Trang (mặc định 1)', schema: { type: 'integer' } }
     #swagger.parameters['limit'] = { in: 'query', description: 'Số dòng/trang (tối đa 200)', schema: { type: 'integer' } } */
  ...staffOrManagerOrAdmin, incidentListValidator, validate, incidentController.list);

router.post('/',
  /* #swagger.tags = ['Incidents']
     #swagger.summary = 'Tạo sự cố (Staff)'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { type: 'wrong_info', description: 'Khách báo sai biển số', sessionId: 1 } } } } */
  ...staffOnly, incidentCreateValidator, validate, incidentController.create);

router.patch('/:id/status',
  /* #swagger.tags = ['Incidents']
     #swagger.summary = 'Cập nhật trạng thái sự cố (Manager/Admin)'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { status: 'resolved' } } } } */
  ...managerOrAdmin, incidentStatusValidator, validate, incidentController.updateStatus);

export default router;
