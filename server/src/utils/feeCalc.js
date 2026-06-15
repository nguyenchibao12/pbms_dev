import { Op } from 'sequelize';
import { PricingRule } from '../models/index.js';
import { AppError } from './helpers.js';

export const calculateParkingFee = (timeIn, timeOut, pricingRule) => {
  const durationMs = new Date(timeOut) - new Date(timeIn);
  if (durationMs < 0) {
    throw new AppError('Invalid session time range', 400, 'VALIDATION_ERROR');
  }
  const durationMinutes = durationMs / (1000 * 60);
  const units = Math.max(1, Math.ceil(durationMinutes / pricingRule.unit));
  return units * Number(pricingRule.base_rate);
};

export const getEffectivePricingRule = async (vehicleTypeId, atTime = new Date()) => {
  const rule = await PricingRule.findOne({
    where: {
      vehicle_type_id: vehicleTypeId,
      effective_from: { [Op.lte]: atTime },
      [Op.or]: [{ effective_to: null }, { effective_to: { [Op.gte]: atTime } }],
    },
    order: [['effective_from', 'DESC']],
  });

  if (!rule) {
    throw new AppError('No active pricing rule for this vehicle type', 404, 'NOT_FOUND');
  }

  return rule;
};
