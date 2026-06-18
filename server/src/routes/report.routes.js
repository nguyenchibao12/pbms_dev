import { Router } from 'express';
import * as reportController from '../controllers/report.controller.js';
import { validate } from '../middleware/validate.js';
import { managerOnly } from '../middleware/access.js';
import { occupancyValidator } from '../validators/report.validator.js';

const router = Router();

router.get('/occupancy',
  /* #swagger.tags = ['Reports']
     #swagger.summary = 'Tỷ lệ lấp đầy hiện tại (Manager)'
     #swagger.parameters['floorId'] = { in: 'query', description: 'Lọc theo tầng', schema: { type: 'integer' } } */
  ...managerOnly, occupancyValidator, validate, reportController.occupancy);

export default router;
