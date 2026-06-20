import { Router } from 'express';
import * as reportController from '../controllers/report.controller.js';
import { validate } from '../middleware/validate.js';
import { managerOnly } from '../middleware/access.js';
import { reportRangeValidator, occupancyValidator } from '../validators/report.validator.js';

const router = Router();

router.get('/occupancy',
  /* #swagger.tags = ['Reports']
     #swagger.summary = 'Tỷ lệ lấp đầy hiện tại (Manager)'
     #swagger.parameters['floorId'] = { in: 'query', description: 'Lọc theo tầng', schema: { type: 'integer' } } */
  ...managerOnly, occupancyValidator, validate, reportController.occupancy);

router.get('/overview',
  /* #swagger.tags = ['Reports']
     #swagger.summary = 'Tổng quan: doanh thu + lưu lượng vào/ra + lấp đầy theo khoảng ngày (Manager)'
     #swagger.parameters['from'] = { in: 'query', required: true, description: 'Từ ngày (ISO8601)', schema: { type: 'string' } }
     #swagger.parameters['to'] = { in: 'query', required: true, description: 'Đến ngày (ISO8601)', schema: { type: 'string' } }
     #swagger.parameters['floorId'] = { in: 'query', description: 'Lọc theo tầng', schema: { type: 'integer' } } */
  ...managerOnly, reportRangeValidator, validate, reportController.overview);

export default router;
