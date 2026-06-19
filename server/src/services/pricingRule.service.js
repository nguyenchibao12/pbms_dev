import { PricingRule, VehicleType } from '../models/index.js';
import { AppError } from '../utils/helpers.js';

const ruleIncludes = [
  { association: 'vehicleType', attributes: ['vehicle_type_id', 'type_name', 'type_code'] },
];

// Hai khoảng [aFrom, aTo] và [bFrom, bTo] giao nhau (effective_to = null nghĩa là vô hạn).
const periodsOverlap = (aFrom, aTo, bFrom, bTo) => {
  const aStart = new Date(aFrom).getTime();
  const aEnd = aTo ? new Date(aTo).getTime() : Infinity;
  const bStart = new Date(bFrom).getTime();
  const bEnd = bTo ? new Date(bTo).getTime() : Infinity;
  return aStart <= bEnd && bStart <= aEnd;
};

// Chặn 2 bảng giá cùng loại xe có khoảng hiệu lực chồng nhau (tránh phí mơ hồ khi tính tiền).
const assertNoOverlap = async (vehicleTypeId, effectiveFrom, effectiveTo, excludeId = null) => {
  const rules = await PricingRule.findAll({ where: { vehicle_type_id: vehicleTypeId } });
  for (const r of rules) {
    if (excludeId && r.pricing_rule_id === excludeId) continue;
    if (periodsOverlap(effectiveFrom, effectiveTo, r.effective_from, r.effective_to)) {
      throw new AppError(
        'Pricing period overlaps an existing rule for this vehicle type',
        409,
        'CONFLICT',
      );
    }
  }
};

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

  await assertNoOverlap(data.vehicleTypeId, data.effectiveFrom, data.effectiveTo || null);

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

  const vehicleTypeId = data.vehicleTypeId ?? rule.vehicle_type_id;
  await assertNoOverlap(vehicleTypeId, effectiveFrom, effectiveTo, rule.pricing_rule_id);

  await rule.update({
    vehicle_type_id: vehicleTypeId,
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
