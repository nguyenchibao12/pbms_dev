import { VehicleType, Zone, PricingRule } from '../models/index.js';
import { AppError } from '../utils/helpers.js';

export const listVehicleTypes = async () =>
  VehicleType.findAll({ order: [['type_name', 'ASC']] });

export const getVehicleType = async (id) => {
  const type = await VehicleType.findByPk(id, {
    include: [{ association: 'pricingRules' }],
  });
  if (!type) throw new AppError('Vehicle type not found', 404, 'NOT_FOUND');
  return type;
};

export const createVehicleType = async (data) => {
  const existing = await VehicleType.findOne({ where: { type_code: data.typeCode } });
  if (existing) throw new AppError('Type code already exists', 409, 'CONFLICT');

  return VehicleType.create({
    type_name: data.typeName,
    type_code: data.typeCode,
    slot_area_m2: data.slotAreaM2 ?? 0,
  });
};

export const updateVehicleType = async (id, data) => {
  const type = await VehicleType.findByPk(id);
  if (!type) throw new AppError('Vehicle type not found', 404, 'NOT_FOUND');

  if (data.typeCode && data.typeCode !== type.type_code) {
    const existing = await VehicleType.findOne({ where: { type_code: data.typeCode } });
    if (existing) throw new AppError('Type code already exists', 409, 'CONFLICT');
  }

  await type.update({
    type_name: data.typeName ?? type.type_name,
    type_code: data.typeCode ?? type.type_code,
    slot_area_m2: data.slotAreaM2 ?? type.slot_area_m2,
  });
  return type;
};

export const deleteVehicleType = async (id) => {
  const type = await VehicleType.findByPk(id);
  if (!type) throw new AppError('Vehicle type not found', 404, 'NOT_FOUND');

  const zoneCount = await Zone.count({ where: { vehicle_type_id: id } });
  const ruleCount = await PricingRule.count({ where: { vehicle_type_id: id } });
  if (zoneCount > 0 || ruleCount > 0) {
    throw new AppError('Cannot delete vehicle type in use by zones or pricing rules', 409, 'CONFLICT');
  }

  await type.destroy();
};
