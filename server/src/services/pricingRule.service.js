import { PricingRule, VehicleType } from '../models/index.js';
import { AppError } from '../utils/helpers.js';

const ruleIncludes = [
  { association: 'vehicleType', attributes: ['vehicle_type_id', 'type_name', 'type_code'] },
];

export const listPricingRules = async (vehicleTypeId) => {
  const where = vehicleTypeId ? { vehicle_type_id: vehicleTypeId } : {};
  return PricingRule.findAll({
    where,
    include: ruleIncludes,
    order: [['effective_from', 'DESC']],
  });
};

export const getPricingRule = async (id) => {
  const rule = await PricingRule.findByPk(id, { include: ruleIncludes });
  if (!rule) throw new AppError('Pricing rule not found', 404, 'NOT_FOUND');
  return rule;
};

export const createPricingRule = async (data) => {
  const vehicleType = await VehicleType.findByPk(data.vehicleTypeId);
  if (!vehicleType) throw new AppError('Vehicle type not found', 404, 'NOT_FOUND');

  if (data.effectiveTo && new Date(data.effectiveFrom) >= new Date(data.effectiveTo)) {
    throw new AppError('effectiveFrom must be before effectiveTo', 400, 'VALIDATION_ERROR');
  }

  return PricingRule.create({
    vehicle_type_id: data.vehicleTypeId,
    unit: data.unit,
    base_rate: data.baseRate,
    effective_from: data.effectiveFrom,
    effective_to: data.effectiveTo || null,
  });
};

export const updatePricingRule = async (id, data) => {
  const rule = await PricingRule.findByPk(id);
  if (!rule) throw new AppError('Pricing rule not found', 404, 'NOT_FOUND');

  if (data.vehicleTypeId) {
    const vehicleType = await VehicleType.findByPk(data.vehicleTypeId);
    if (!vehicleType) throw new AppError('Vehicle type not found', 404, 'NOT_FOUND');
  }

  const effectiveFrom = data.effectiveFrom ?? rule.effective_from;
  const effectiveTo = data.effectiveTo !== undefined ? data.effectiveTo : rule.effective_to;
  if (effectiveTo && new Date(effectiveFrom) >= new Date(effectiveTo)) {
    throw new AppError('effectiveFrom must be before effectiveTo', 400, 'VALIDATION_ERROR');
  }

  await rule.update({
    vehicle_type_id: data.vehicleTypeId ?? rule.vehicle_type_id,
    unit: data.unit ?? rule.unit,
    base_rate: data.baseRate ?? rule.base_rate,
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
  });
  return rule;
};

export const deletePricingRule = async (id) => {
  const rule = await PricingRule.findByPk(id);
  if (!rule) throw new AppError('Pricing rule not found', 404, 'NOT_FOUND');
  await rule.destroy();
};
