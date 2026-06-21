import { Router } from 'express';
import * as monthlyPassController from '../controllers/monthlyPass.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticated, userOnly } from '../middleware/access.js';
import { passIdParam } from '../validators/monthlyPass.validator.js';

const router = Router();

router.get('/mine',
  /* #swagger.tags = ['Monthly Passes']
     #swagger.summary = 'Vé tháng của tôi (User)' */
  ...userOnly, monthlyPassController.listMine);

router.get('/capacity',
  /* #swagger.tags = ['Monthly Passes']
     #swagger.summary = 'Sức chứa vé tháng còn lại theo tầng + loại xe'
     #swagger.parameters['floorId'] = { in: 'query', required: true, schema: { type: 'integer' } }
     #swagger.parameters['vehicleTypeId'] = { in: 'query', required: true, schema: { type: 'integer' } } */
  ...authenticated, monthlyPassController.getCapacity);

// LƯU Ý: '/:id' (route bắt-tất) phải nằm DƯỚI mọi route chữ cụ thể như '/mine', '/capacity'.
router.get('/:id',
  /* #swagger.tags = ['Monthly Passes']
     #swagger.summary = 'Chi tiết vé tháng (chủ vé hoặc Staff)' */
  ...authenticated, passIdParam, validate, monthlyPassController.get);

export default router;
