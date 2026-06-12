import * as pricingRuleService from '../services/pricingRule.service.js';
import { asyncHandler, successResponse } from '../utils/helpers.js';

export const list = asyncHandler(async (req, res) => {
  const rules = await pricingRuleService.listPricingRules(req.query.vehicleTypeId);
  successResponse(res, rules);
});

export const get = asyncHandler(async (req, res) => {
  const rule = await pricingRuleService.getPricingRule(req.params.id);
  successResponse(res, rule);
});

export const create = asyncHandler(async (req, res) => {
  const rule = await pricingRuleService.createPricingRule(req.body);
  successResponse(res, rule, 'Pricing rule created', 201);
});

export const update = asyncHandler(async (req, res) => {
  const rule = await pricingRuleService.updatePricingRule(req.params.id, req.body);
  successResponse(res, rule, 'Pricing rule updated');
});

export const remove = asyncHandler(async (req, res) => {
  await pricingRuleService.deletePricingRule(req.params.id);
  successResponse(res, null, 'Pricing rule deleted');
});
