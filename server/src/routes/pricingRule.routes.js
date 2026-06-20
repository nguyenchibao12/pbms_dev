import { Router } from 'express';
import * as pricingRuleController from '../controllers/pricingRule.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticated, managerWrite } from '../middleware/access.js';
import { pricingRuleValidators, idParam } from '../validators/masterData.validator.js';

const router = Router();

router.get('/',
  /* #swagger.tags = ['Pricing Rules']
     #swagger.summary = 'Danh sách bảng giá'
     #swagger.parameters['vehicleTypeId'] = { in: 'query', description: 'Lọc theo loại xe', schema: { type: 'integer' } } */
  ...authenticated, pricingRuleValidators.list, validate, pricingRuleController.list);

router.get('/:id',
  /* #swagger.tags = ['Pricing Rules']
     #swagger.summary = 'Chi tiết bảng giá' */
  ...authenticated, idParam, validate, pricingRuleController.get);

router.post('/',
  /* #swagger.tags = ['Pricing Rules']
     #swagger.summary = 'Thêm bảng giá (Manager)'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { vehicleTypeId: 1, unit: 60, baseRate: 10000, effectiveFrom: '2026-01-01T00:00:00Z' } } } } */
  ...managerWrite, pricingRuleValidators.create, validate, pricingRuleController.create);

router.put('/:id',
  /* #swagger.tags = ['Pricing Rules']
     #swagger.summary = 'Sửa bảng giá (Manager)'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { baseRate: 12000 } } } } */
  ...managerWrite, pricingRuleValidators.update, validate, pricingRuleController.update);

router.delete('/:id',
  /* #swagger.tags = ['Pricing Rules']
     #swagger.summary = 'Xóa bảng giá (Manager)' */
  ...managerWrite, idParam, validate, pricingRuleController.remove);

export default router;
