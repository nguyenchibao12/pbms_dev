import { Gate, Floor, VehicleType } from '../models/index.js';
import { AppError } from '../utils/helpers.js';

const gateIncludes = [
  { association: 'floor', attributes: ['floor_id', 'floor_code', 'label'] },
  { association: 'vehicleType', attributes: ['vehicle_type_id', 'type_name', 'type_code'] },
];

export const listGates = async (floorId) => {
  const where = floorId ? { floor_id: floorId } : {};
  return Gate.findAll({ where, include: gateIncludes, order: [['gate_code', 'ASC']] });
};

export const getGate = async (id) => {
  const gate = await Gate.findByPk(id, { include: gateIncludes });
  if (!gate) throw new AppError('Gate not found', 404, 'NOT_FOUND');
  return gate;
};

// Mỗi phạm vi (1 tầng, hoặc cấp tòa nhà = floor_id NULL) chỉ được 1 cổng IN + 1 cổng OUT.
const assertSingleDirectionGate = async (floorId, direction, excludeGateId = null) => {
  if (!direction) return;
  const existing = await Gate.findOne({ where: { floor_id: floorId, direction } });
  if (existing && existing.gate_id !== excludeGateId) {
    const scope = floorId == null ? 'tòa nhà' : `tầng (floorId=${floorId})`;
    throw new AppError(
      `Mỗi ${scope} chỉ được 1 cổng ${direction.toUpperCase()} (đã có cổng "${existing.gate_code}")`,
      409,
      'CONFLICT',
    );
  }
};

export const createGate = async (data) => {
  const floorId = data.floorId ?? null; // NULL = cổng cấp tòa nhà
  if (floorId != null) {
    const floor = await Floor.findByPk(floorId);
    if (!floor) throw new AppError('Floor not found', 404, 'NOT_FOUND');
  }

  const existing = await Gate.findOne({
    where: { floor_id: floorId, gate_code: data.gateCode },
  });
  if (existing) throw new AppError('Gate code already exists on this scope', 409, 'CONFLICT');

  await assertSingleDirectionGate(floorId, data.direction, null);

  if (data.vehicleTypeId) {
    const vt = await VehicleType.findByPk(data.vehicleTypeId);
    if (!vt) throw new AppError('Vehicle type not found', 404, 'NOT_FOUND');
  }

  return Gate.create({
    floor_id: floorId,
    gate_code: data.gateCode,
    direction: data.direction,
    vehicle_type_id: data.vehicleTypeId ?? null,
    label: data.label ?? null,
    is_active: data.isActive ?? true,
  });
};

export const updateGate = async (id, data) => {
  const gate = await Gate.findByPk(id);
  if (!gate) throw new AppError('Gate not found', 404, 'NOT_FOUND');

  const newFloorId = data.floorId !== undefined ? data.floorId : gate.floor_id;
  if (newFloorId != null) {
    const floor = await Floor.findByPk(newFloorId);
    if (!floor) throw new AppError('Floor not found', 404, 'NOT_FOUND');
  }

  const newGateCode = data.gateCode ?? gate.gate_code;
  if (newGateCode !== gate.gate_code || newFloorId !== gate.floor_id) {
    const existing = await Gate.findOne({
      where: { floor_id: newFloorId, gate_code: newGateCode },
    });
    if (existing && existing.gate_id !== gate.gate_id) {
      throw new AppError('Gate code already exists on this scope', 409, 'CONFLICT');
    }
  }

  const newDirection = data.direction ?? gate.direction;
  if (newDirection !== gate.direction || newFloorId !== gate.floor_id) {
    await assertSingleDirectionGate(newFloorId, newDirection, gate.gate_id);
  }

  if (data.vehicleTypeId !== undefined) {
    if (data.vehicleTypeId) {
      const vt = await VehicleType.findByPk(data.vehicleTypeId);
      if (!vt) throw new AppError('Vehicle type not found', 404, 'NOT_FOUND');
    }
  }

  await gate.update({
    floor_id: newFloorId,
    gate_code: newGateCode,
    direction: data.direction ?? gate.direction,
    vehicle_type_id: data.vehicleTypeId !== undefined ? data.vehicleTypeId : gate.vehicle_type_id,
    label: data.label !== undefined ? data.label : gate.label,
    is_active: data.isActive ?? gate.is_active,
  });
  return gate;
};

export const deleteGate = async (id) => {
  const gate = await Gate.findByPk(id);
  if (!gate) throw new AppError('Gate not found', 404, 'NOT_FOUND');
  await gate.destroy();
};
