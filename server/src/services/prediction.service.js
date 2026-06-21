import { Op } from 'sequelize';
import {
  ParkingSession,
  ParkingSlot,
  Reservation,
  Floor,
  Zone,
} from '../models/index.js';

const LOOKBACK_WEEKS = 8;

const slotOnFloorInclude = (floorId) => [
  {
    association: 'slot',
    attributes: [],
    required: true,
    include: [
      {
        association: 'zone',
        attributes: [],
        where: { floor_id: floorId },
        required: true,
      },
    ],
  },
];

/** Dự đoán mức độ đông theo giờ trong tuần từ lịch sử phiên (trung bình 8 tuần). */
export const predictFloorOccupancyAt = async (floorId, atTime) => {
  const target = new Date(atTime);
  const dow = target.getDay();
  const hour = target.getHours();

  const zones = await Zone.findAll({
    where: { floor_id: floorId },
    attributes: ['zone_id'],
  });
  const zoneIds = zones.map((z) => z.zone_id);
  if (!zoneIds.length) {
    return { predictedOccupancyRate: 0, sampleSize: 0, hour, dayOfWeek: dow };
  }

  const totalSlots = await ParkingSlot.count({
    where: { zone_id: { [Op.in]: zoneIds } },
  });
  if (!totalSlots) {
    return { predictedOccupancyRate: 0, sampleSize: 0, hour, dayOfWeek: dow };
  }

  const lookbackStart = new Date(target);
  lookbackStart.setDate(lookbackStart.getDate() - LOOKBACK_WEEKS * 7);

  const sessions = await ParkingSession.findAll({
    where: {
      time_in: { [Op.gte]: lookbackStart },
      status: { [Op.in]: ['completed', 'active'] },
    },
    attributes: ['time_in', 'time_out'],
    include: slotOnFloorInclude(floorId),
  });

  let matchCount = 0;
  for (const s of sessions) {
    const tin = new Date(s.time_in);
    if (tin.getDay() !== dow) continue;
    if (Math.abs(tin.getHours() - hour) <= 1) matchCount += 1;
  }

  const avgEntries = matchCount / LOOKBACK_WEEKS;
  const rate = Math.min(100, Math.round((avgEntries / totalSlots) * 1000) / 10);

  return {
    predictedOccupancyRate: rate,
    sampleSize: matchCount,
    hour,
    dayOfWeek: dow,
    totalSlots,
  };
};

/** So sánh các tầng có zone cho loại xe — tầng nào dự báo vắng hơn tại thời điểm đặt. */
export const compareFloorsAtTime = async (vehicleTypeId, atTime, currentFloorId = null) => {
  const floors = await Floor.findAll({
    include: [
      {
        association: 'zones',
        where: { vehicle_type_id: vehicleTypeId },
        required: true,
        attributes: ['zone_id'],
      },
    ],
    order: [['floor_level', 'ASC']],
  });

  const ranked = [];
  for (const floor of floors) {
    const pred = await predictFloorOccupancyAt(floor.floor_id, atTime);
    ranked.push({
      floorId: floor.floor_id,
      floorCode: floor.floor_code,
      label: floor.label,
      predictedOccupancyRate: pred.predictedOccupancyRate,
      sampleSize: pred.sampleSize,
      isSelected: currentFloorId === floor.floor_id,
    });
  }

  ranked.sort((a, b) => a.predictedOccupancyRate - b.predictedOccupancyRate);
  const quietest = ranked[0];
  const selected = ranked.find((f) => f.isSelected);

  return {
    floors: ranked,
    quietestFloor: quietest || null,
    selectedFloor: selected || null,
    quieterAlternatives: ranked.filter(
      (f) =>
        currentFloorId &&
        f.floorId !== currentFloorId &&
        f.predictedOccupancyRate < (selected?.predictedOccupancyRate ?? 100) - 5,
    ),
  };
};

/** Lịch sử tầng/khu user hay dùng (phiên + đặt chỗ). */
export const getUserParkingPreferences = async (userId) => {
  if (!userId) return null;

  const floorCounts = new Map();
  const zoneCounts = new Map();

  const bump = (map, key, meta) => {
    if (!key) return;
    const cur = map.get(key) || { count: 0, ...meta };
    cur.count += 1;
    map.set(key, cur);
  };

  const sessions = await ParkingSession.findAll({
    where: { user_id: userId },
    attributes: ['session_id'],
    include: [
      {
        association: 'slot',
        include: [
          {
            association: 'zone',
            attributes: ['zone_id', 'floor_id', 'zone_code'],
            include: [{ association: 'floor', attributes: ['floor_id', 'floor_code'] }],
          },
        ],
      },
    ],
    order: [['time_in', 'DESC']],
    limit: 80,
  });

  for (const s of sessions) {
    const z = s.slot?.zone;
    if (!z) continue;
    bump(floorCounts, z.floor_id, { floorCode: z.floor?.floor_code });
    bump(zoneCounts, z.zone_id, { zoneCode: z.zone_code, floorId: z.floor_id });
  }

  const reservations = await Reservation.findAll({
    where: {
      user_id: userId,
      status: { [Op.in]: ['confirmed', 'checked_in', 'completed'] },
    },
    attributes: ['reservation_id'],
    include: [
      { association: 'floor', attributes: ['floor_id', 'floor_code'] },
      { association: 'zone', attributes: ['zone_id', 'zone_code'] },
    ],
    order: [['start_time', 'DESC']],
    limit: 40,
  });

  for (const r of reservations) {
    bump(floorCounts, r.floor_id, { floorCode: r.floor?.floor_code });
    bump(zoneCounts, r.zone_id, { zoneCode: r.zone?.zone_code, floorId: r.floor_id });
  }

  const topFloorEntry = [...floorCounts.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  const topZoneEntry = [...zoneCounts.entries()].sort((a, b) => b[1].count - a[1].count)[0];

  if (!topFloorEntry && !topZoneEntry) return null;

  return {
    favoriteFloorId: topFloorEntry ? Number(topFloorEntry[0]) : null,
    favoriteFloorCode: topFloorEntry?.[1]?.floorCode ?? null,
    favoriteFloorVisits: topFloorEntry?.[1]?.count ?? 0,
    favoriteZoneId: topZoneEntry ? Number(topZoneEntry[0]) : null,
    favoriteZoneCode: topZoneEntry?.[1]?.zoneCode ?? null,
    favoriteZoneVisits: topZoneEntry?.[1]?.count ?? 0,
  };
};

/** Chỗ reserved/occupied có khung đặt chỗ kết thúc trong ca user → có thể trống sớm. */
export const getTurnoverForecast = async (floorId, vehicleTypeId, windowStart, windowEnd) => {
  const start = new Date(windowStart);
  const end = new Date(windowEnd);

  const reservations = await Reservation.findAll({
    where: {
      floor_id: floorId,
      vehicle_type_id: vehicleTypeId,
      status: { [Op.in]: ['confirmed', 'checked_in'] },
      end_time: { [Op.gt]: start, [Op.lte]: end },
    },
    include: [{ association: 'slot', attributes: ['slot_id', 'slot_code', 'status', 'zone_id'] }],
    order: [['end_time', 'ASC']],
    limit: 20,
  });

  const slots = reservations
    .filter((r) => r.slot && ['reserved', 'occupied'].includes(r.slot.status))
    .map((r) => ({
      slotId: r.slot.slot_id,
      slotCode: r.slot.slot_code,
      expectedFreeAt: r.end_time,
      status: r.slot.status,
    }));

  return {
    count: slots.length,
    slots: slots.slice(0, 5),
  };
};

/** Gói insights cho preview đặt chỗ (Mức 3). */
export const getParkingInsights = async ({
  floorId,
  vehicleTypeId,
  userId,
  startTime,
  endTime,
}) => {
  const [floorCompare, userPrefs, turnover, selectedPred] = await Promise.all([
    compareFloorsAtTime(vehicleTypeId, startTime, floorId),
    getUserParkingPreferences(userId),
    getTurnoverForecast(floorId, vehicleTypeId, startTime, endTime),
    predictFloorOccupancyAt(floorId, startTime),
  ]);

  const messages = [];

  if (floorCompare.quieterAlternatives?.length > 0) {
    const alt = floorCompare.quieterAlternatives[0];
    messages.push(
      `Dự báo: tầng ${alt.floorCode} vắng hơn (~${alt.predictedOccupancyRate}% lấp đầy) so với tầng bạn chọn.`,
    );
  } else if (selectedPred.sampleSize > 0) {
    messages.push(
      `Dự báo tầng đã chọn: ~${selectedPred.predictedOccupancyRate}% lấp đầy vào khung giờ này (từ ${selectedPred.sampleSize} mẫu lịch sử).`,
    );
  }

  if (userPrefs?.favoriteZoneCode) {
    messages.push(
      `Bạn thường đỗ khu ${userPrefs.favoriteZoneCode} (${userPrefs.favoriteZoneVisits} lần) — ưu tiên gợi ý gần khu quen.`,
    );
  } else if (userPrefs?.favoriteFloorCode) {
    messages.push(
      `Bạn hay dùng tầng ${userPrefs.favoriteFloorCode} (${userPrefs.favoriteFloorVisits} lần).`,
    );
  }

  if (turnover.count > 0) {
    const codes = turnover.slots.map((s) => s.slotCode).join(', ');
    messages.push(
      `Turnover: ${turnover.count} chỗ có thể trống trong ca (${codes}${turnover.count > 5 ? '…' : ''}).`,
    );
  }

  return {
    messages,
    floorComparison: floorCompare.floors,
    quietestFloor: floorCompare.quietestFloor,
    selectedFloorPrediction: selectedPred,
    userPreferences: userPrefs,
    turnover,
  };
};
