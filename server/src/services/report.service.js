import { Op } from 'sequelize';
import { ParkingSlot, Zone, Floor } from '../models/index.js';

const slotWhereForFloor = async (floorId) => {
  if (!floorId) return {};
  const zones = await Zone.findAll({
    where: { floor_id: floorId },
    attributes: ['zone_id'],
  });
  const zoneIds = zones.map((z) => z.zone_id);
  if (zoneIds.length === 0) return { zone_id: -1 };
  return { zone_id: { [Op.in]: zoneIds.length ? zoneIds : [-1] } };
};

export const getOccupancy = async (floorId = null) => {
  const slotWhere = await slotWhereForFloor(floorId);

  const [total, available, occupied, reserved, maintenance, locked] = await Promise.all([
    ParkingSlot.count({ where: slotWhere }),
    ParkingSlot.count({ where: { ...slotWhere, status: 'available' } }),
    ParkingSlot.count({ where: { ...slotWhere, status: 'occupied' } }),
    ParkingSlot.count({ where: { ...slotWhere, status: 'reserved' } }),
    ParkingSlot.count({ where: { ...slotWhere, status: 'maintenance' } }),
    ParkingSlot.count({ where: { ...slotWhere, status: 'locked' } }),
  ]);

  const inUse = occupied;
  const occupancyRate = total > 0 ? Math.round((occupied / total) * 1000) / 10 : 0;

  const floorBreakdown = await Promise.all(
    (await Floor.findAll({ order: [['floor_level', 'ASC']] })).map(async (floor) => {
      const fWhere = await slotWhereForFloor(floor.floor_id);
      const fTotal = await ParkingSlot.count({ where: fWhere });
      const fInUse = await ParkingSlot.count({
        where: { ...fWhere, status: 'occupied' },
      });
      return {
        floorId: floor.floor_id,
        floorCode: floor.floor_code,
        label: floor.label,
        total: fTotal,
        inUse: fInUse,
        occupancyRate: fTotal > 0 ? Math.round((fInUse / fTotal) * 1000) / 10 : 0,
      };
    })
  );

  return {
    snapshot: { total, available, occupied, reserved, maintenance, locked, inUse, occupancyRate },
    byFloor: floorBreakdown,
  };
};
