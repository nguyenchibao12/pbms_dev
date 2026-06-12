import { Router } from 'express';
import * as pricingRuleController from '../controllers/pricingRule.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticated, managerWrite } from '../middleware/access.js';
import { pricingRuleValidators, idParam } from '../validators/masterData.validator.js';

const router = Router();

router.get('/', ...authenticated, pricingRuleValidators.list, validate, pricingRuleController.list);
router.get('/:id', ...authenticated, idParam, validate, pricingRuleController.get);
router.post('/', ...managerWrite, pricingRuleValidators.create, validate, pricingRuleController.create);
router.put('/:id', ...managerWrite, pricingRuleValidators.update, validate, pricingRuleController.update);
router.delete('/:id', ...managerWrite, idParam, validate, pricingRuleController.remove);

export default router;
