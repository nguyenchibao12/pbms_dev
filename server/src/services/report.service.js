import { Op } from 'sequelize';
import sequelize from '../config/db.js';
import { ParkingSlot, ParkingSession, Payment, Zone, Floor } from '../models/index.js';
import { AppError } from '../utils/helpers.js';

const parseDateRange = (from, to) => {
  if (!from || !to) {
    throw new AppError('from and to dates are required (ISO8601)', 400, 'VALIDATION_ERROR');
  }
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw new AppError('Invalid date range', 400, 'VALIDATION_ERROR');
  }
  toDate.setHours(23, 59, 59, 999);
  if (toDate < fromDate) {
    throw new AppError('to must be on or after from', 400, 'VALIDATION_ERROR');
  }
  return { fromDate, toDate };
};

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

const sessionIncludeForFloor = async (floorId) => {
  if (!floorId) return [];
  const slotWhere = await slotWhereForFloor(floorId);
  return [{ association: 'slot', attributes: [], required: true, where: slotWhere }];
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

export const getOverviewReport = async ({ from, to, floorId = null }) => {
  const { fromDate, toDate } = parseDateRange(from, to);
  const sessionInclude = await sessionIncludeForFloor(floorId);

  const occupancy = await getOccupancy(floorId);

  const totalRevenue =
    (await Payment.sum('amount', {
      where: {
        status: 'success',
        paid_at: { [Op.between]: [fromDate, toDate] },
      },
    })) || 0;

  const revenueByType = await Payment.findAll({
    attributes: [
      [
        sequelize.literal(`
          CASE
            WHEN session_id IS NOT NULL THEN 'parking'
            WHEN reservation_id IS NOT NULL THEN 'booking'
            WHEN pass_id IS NOT NULL THEN 'monthly_pass'
            ELSE 'other'
          END
        `),
        'type',
      ],
      [sequelize.fn('SUM', sequelize.col('amount')), 'total'],
      [sequelize.fn('COUNT', sequelize.col('payment_id')), 'count'],
    ],
    where: {
      status: 'success',
      paid_at: { [Op.between]: [fromDate, toDate] },
    },
    group: [sequelize.literal('type')],
    raw: true,
  });

  // Doanh thu theo phương thức thanh toán (payos / cash / free) — phục vụ đối soát.
  const revenueByMethod = await Payment.findAll({
    attributes: [
      'method',
      [sequelize.fn('SUM', sequelize.col('amount')), 'total'],
      [sequelize.fn('COUNT', sequelize.col('payment_id')), 'count'],
    ],
    where: {
      status: 'success',
      paid_at: { [Op.between]: [fromDate, toDate] },
    },
    group: ['method'],
    raw: true,
  });

  const entries = await ParkingSession.count({
    where: { time_in: { [Op.between]: [fromDate, toDate] } },
    include: sessionInclude,
  });

  const exits = await ParkingSession.count({
    where: { time_out: { [Op.between]: [fromDate, toDate] } },
    include: sessionInclude,
  });

  const dailyRevenue = await Payment.findAll({
    attributes: [
      [sequelize.fn('DATE', sequelize.col('paid_at')), 'date'],
      [sequelize.fn('SUM', sequelize.col('amount')), 'revenue'],
    ],
    where: {
      status: 'success',
      paid_at: { [Op.between]: [fromDate, toDate] },
    },
    group: [sequelize.fn('DATE', sequelize.col('paid_at'))],
    order: [[sequelize.fn('DATE', sequelize.col('paid_at')), 'ASC']],
    raw: true,
  });

  const dailyEntries = await ParkingSession.findAll({
    attributes: [
      [sequelize.fn('DATE', sequelize.col('time_in')), 'date'],
      [sequelize.fn('COUNT', sequelize.col('session_id')), 'entries'],
    ],
    where: { time_in: { [Op.between]: [fromDate, toDate] } },
    include: sessionInclude,
    group: [sequelize.fn('DATE', sequelize.col('time_in'))],
    order: [[sequelize.fn('DATE', sequelize.col('time_in')), 'ASC']],
    raw: true,
  });

  const dailyExits = await ParkingSession.findAll({
    attributes: [
      [sequelize.fn('DATE', sequelize.col('time_out')), 'date'],
      [sequelize.fn('COUNT', sequelize.col('session_id')), 'exits'],
    ],
    where: { time_out: { [Op.between]: [fromDate, toDate] } },
    include: sessionInclude,
    group: [sequelize.fn('DATE', sequelize.col('time_out'))],
    order: [[sequelize.fn('DATE', sequelize.col('time_out')), 'ASC']],
    raw: true,
  });

  const trafficMap = new Map();
  dailyEntries.forEach((row) => {
    trafficMap.set(row.date, { date: row.date, entries: Number(row.entries), exits: 0 });
  });
  dailyExits.forEach((row) => {
    const existing = trafficMap.get(row.date) || { date: row.date, entries: 0, exits: 0 };
    existing.exits = Number(row.exits);
    trafficMap.set(row.date, existing);
  });
  const dailyTraffic = [...trafficMap.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const activeSessions = await ParkingSession.count({
    where: { status: 'active' },
    include: sessionInclude,
  });

  return {
    period: { from: fromDate.toISOString(), to: toDate.toISOString() },
    floorId: floorId ? Number(floorId) : null,
    occupancy,
    revenue: {
      total: Number(totalRevenue),
      byType: revenueByType.map((r) => ({
        type: r.type,
        total: Number(r.total),
        count: Number(r.count),
      })),
      byMethod: revenueByMethod.map((r) => ({
        method: r.method,
        total: Number(r.total),
        count: Number(r.count),
      })),
      daily: dailyRevenue.map((r) => ({
        date: r.date,
        revenue: Number(r.revenue),
      })),
    },
    traffic: {
      entries,
      exits,
      activeSessions,
      daily: dailyTraffic,
    },
  };
};
