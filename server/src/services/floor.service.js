import sequelize from '../config/db.js';
import { Floor, Zone, Gate, ParkingSlot, VehicleType } from '../models/index.js';
import { AppError } from '../utils/helpers.js';
import { bulkGenerateSlots } from './parkingSlot.service.js';

export const listFloors = async () =>
  Floor.findAll({ order: [['floor_level', 'ASC']] });

export const getFloor = async (id) => {
  const floor = await Floor.findByPk(id, {
    include: [
      { association: 'zones', include: [{ association: 'vehicleType' }] },
      { association: 'gates' },
    ],
  });
  if (!floor) throw new AppError('Floor not found', 404, 'NOT_FOUND');
  return floor;
};

export const createFloor = async (data) => {
  const existing = await Floor.findOne({ where: { floor_code: data.floorCode } });
  if (existing) throw new AppError('Floor code already exists', 409, 'CONFLICT');
  return Floor.create({
    floor_code: data.floorCode,
    floor_level: data.floorLevel,
    label: data.label,
  });
};

export const updateFloor = async (id, data) => {
  const floor = await Floor.findByPk(id);
  if (!floor) throw new AppError('Floor not found', 404, 'NOT_FOUND');

  if (data.floorCode && data.floorCode !== floor.floor_code) {
    const existing = await Floor.findOne({ where: { floor_code: data.floorCode } });
    if (existing) throw new AppError('Floor code already exists', 409, 'CONFLICT');
  }

  await floor.update({
    floor_code: data.floorCode ?? floor.floor_code,
    floor_level: data.floorLevel ?? floor.floor_level,
    label: data.label ?? floor.label,
  });
  return floor;
};

export const deleteFloor = async (id) => {
  const floor = await Floor.findByPk(id);
  if (!floor) throw new AppError('Floor not found', 404, 'NOT_FOUND');

  const zoneCount = await Zone.count({ where: { floor_id: id } });
  const gateCount = await Gate.count({ where: { floor_id: id } });
  if (zoneCount > 0 || gateCount > 0) {
    throw new AppError('Cannot delete floor with existing zones or gates', 409, 'CONFLICT');
  }

  await floor.destroy();
};

/**
 * Thiết lập nhanh cả tầng: floor + zones + slots + gates (tùy chọn) trong 1 transaction.
 */
export const quickSetupFloor = async (payload) => {
  const { floor: floorData, zones: zoneConfigs, gates: gateOpts } = payload;

  return sequelize.transaction(async (transaction) => {
    const existing = await Floor.findOne({
      where: { floor_code: floorData.floorCode },
      transaction,
    });
    if (existing) throw new AppError('Floor code already exists', 409, 'CONFLICT');

    const floor = await Floor.create(
      {
        floor_code: floorData.floorCode,
        floor_level: floorData.floorLevel,
        label: floorData.label,
      },
      { transaction },
    );

    const vehicleTypeIds = new Set();
    const createdZones = [];

    for (const zc of zoneConfigs) {
      const zoneDup = await Zone.findOne({
        where: { floor_id: floor.floor_id, zone_code: zc.zoneCode },
        transaction,
      });
      if (zoneDup) {
        throw new AppError(`Zone code "${zc.zoneCode}" already exists on this floor`, 409, 'CONFLICT');
      }

      const vt = await VehicleType.findByPk(zc.vehicleTypeId, { transaction });
      if (!vt) throw new AppError('Vehicle type not found', 404, 'NOT_FOUND');

      if ((zc.monthlyPassCapacity ?? 0) > zc.slotCount) {
        throw new AppError(
          `Zone "${zc.zoneCode}": monthlyPassCapacity cannot exceed slotCount`,
          400,
          'VALIDATION_ERROR',
        );
      }

      const zone = await Zone.create(
        {
          floor_id: floor.floor_id,
          vehicle_type_id: zc.vehicleTypeId,
          zone_code: zc.zoneCode,
          label: zc.label,
          total_slots: zc.slotCount,
          monthly_pass_capacity: zc.monthlyPassCapacity ?? 0,
        },
        { transaction },
      );

      vehicleTypeIds.add(zc.vehicleTypeId);

      const slotResult = await bulkGenerateSlots(
        zone.zone_id,
        {
          count: zc.slotCount,
          codePrefix: zc.codePrefix,
          startIndex: zc.startIndex ?? 1,
          padding: zc.padding ?? 2,
          distanceStart: zc.distanceStart ?? null,
          distanceStep: zc.distanceStep ?? null,
          slotType: zc.slotType ?? null,
        },
        transaction,
      );

      createdZones.push({ zone, slots: slotResult });
    }

    const createdGates = [];
    if (gateOpts?.auto) {
      const floorCode = floor.floor_code.toUpperCase();
      for (const vtId of vehicleTypeIds) {
        const vt = await VehicleType.findByPk(vtId, { transaction });
        const typeCode = vt.type_code.toUpperCase();

        for (const [direction, suffix] of [
          ['in', 'IN'],
          ['out', 'OUT'],
        ]) {
          const gateCode = `${floorCode}-${suffix}-${typeCode}`;
          const gateDup = await Gate.findOne({
            where: { floor_id: floor.floor_id, gate_code: gateCode },
            transaction,
          });
          if (gateDup) {
            throw new AppError(`Gate code "${gateCode}" already exists`, 409, 'CONFLICT');
          }

          const gate = await Gate.create(
            {
              floor_id: floor.floor_id,
              gate_code: gateCode,
              direction,
              vehicle_type_id: vtId,
              label: `Cổng ${suffix === 'IN' ? 'vào' : 'ra'} ${vt.type_name} — ${floor.label}`,
              is_active: true,
            },
            { transaction },
          );
          createdGates.push(gate);
        }
      }
    }

    return {
      floor,
      zones: createdZones,
      gates: createdGates,
      summary: {
        zoneCount: createdZones.length,
        slotCount: createdZones.reduce((sum, z) => sum + z.slots.created, 0),
        gateCount: createdGates.length,
      },
    };
  });
};

/**
 * Nhân bản cấu trúc zone/slot/gate sang tầng mới. Slot reset về available.
 */
export const cloneFloor = async (sourceFloorId, payload) => {
  const source = await Floor.findByPk(sourceFloorId, {
    include: [
      { association: 'zones', include: [{ association: 'parkingSlots' }] },
      { association: 'gates' },
    ],
  });
  if (!source) throw new AppError('Floor not found', 404, 'NOT_FOUND');

  const { floorCode, floorLevel, label } = payload;

  return sequelize.transaction(async (transaction) => {
    const existing = await Floor.findOne({ where: { floor_code: floorCode }, transaction });
    if (existing) throw new AppError('Floor code already exists', 409, 'CONFLICT');

    const newFloor = await Floor.create(
      {
        floor_code: floorCode,
        floor_level: floorLevel,
        label,
      },
      { transaction },
    );

    const oldPrefix = source.floor_code.toUpperCase();
    const newPrefix = floorCode.toUpperCase();

    for (const zone of source.zones) {
      const newZone = await Zone.create(
        {
          floor_id: newFloor.floor_id,
          vehicle_type_id: zone.vehicle_type_id,
          zone_code: zone.zone_code,
          label: zone.label,
          total_slots: zone.parkingSlots?.length ?? 0,
          monthly_pass_capacity: zone.monthly_pass_capacity,
        },
        { transaction },
      );

      if (zone.parkingSlots?.length) {
        await ParkingSlot.bulkCreate(
          zone.parkingSlots.map((s) => ({
            zone_id: newZone.zone_id,
            slot_code: s.slot_code,
            status: 'available',
            slot_type: s.slot_type,
            distance_to_gate: s.distance_to_gate,
          })),
          { transaction },
        );
      }
    }

    for (const gate of source.gates) {
      let gateCode = gate.gate_code;
      if (gateCode.toUpperCase().startsWith(`${oldPrefix}-`)) {
        gateCode = `${newPrefix}-${gateCode.slice(oldPrefix.length + 1)}`;
      }

      await Gate.create(
        {
          floor_id: newFloor.floor_id,
          gate_code: gateCode,
          direction: gate.direction,
          vehicle_type_id: gate.vehicle_type_id,
          label: gate.label,
          is_active: gate.is_active,
        },
        { transaction },
      );
    }

    return getFloor(newFloor.floor_id);
  });
};
