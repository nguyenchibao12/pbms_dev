import { Op } from 'sequelize';
import sequelize from '../config/db.js';
import { ParkingSlot, VehicleType } from '../models/index.js';
import { getSuggestStrategy, getSuggestScoreWeights } from './settings.js';

export const DEFAULT_SCORE_WEIGHTS = {
  gate: 1,
  zone_balance: 0.5,
  elevator: 0.3,
  slot_type: 0.2,
  preference: 0.25,
};

const normInverseDistance = (dist) => {
  if (dist == null || Number.isNaN(Number(dist))) return 0.5;
  return 1 / (Number(dist) + 1);
};

export const resolveScoreWeights = (strategy, customWeights) => {
  if (strategy === 'scoring') {
    return { ...DEFAULT_SCORE_WEIGHTS, ...customWeights };
  }
  if (strategy === 'zone_balanced') {
    return { gate: 0.4, zone_balance: 1, elevator: 0, slot_type: 0 };
  }
  return { gate: 1, zone_balance: 0, elevator: 0, slot_type: 0 };
};

const computeZoneLoad = async (zoneIds) => {
  if (!zoneIds.length) return new Map();

  const rows = await ParkingSlot.findAll({
    attributes: [
      'zone_id',
      [
        sequelize.fn(
          'SUM',
          sequelize.literal(`CASE WHEN status IN ('occupied','reserved') THEN 1 ELSE 0 END`),
        ),
        'used',
      ],
      [sequelize.fn('COUNT', sequelize.col('slot_id')), 'total'],
    ],
    where: { zone_id: { [Op.in]: zoneIds } },
    group: ['zone_id'],
    raw: true,
  });

  const map = new Map();
  for (const row of rows) {
    const total = Number(row.total) || 1;
    const used = Number(row.used) || 0;
    map.set(row.zone_id, used / total);
  }
  return map;
};

const preferenceScore = (slot, userPrefs) => {
  if (!userPrefs) return 0.5;
  if (userPrefs.favoriteZoneId && slot.zone_id === Number(userPrefs.favoriteZoneId)) return 1;
  const floorId = slot.zone?.floor_id ?? slot.zone?.floor?.floor_id;
  if (userPrefs.favoriteFloorId && floorId === Number(userPrefs.favoriteFloorId)) return 0.75;
  return 0.5;
};

export const scoreSlot = (slot, { weights, zoneLoad, vehicleTypeCode, userPrefs }) => {
  const gateScore = normInverseDistance(slot.distance_to_gate);
  const load = zoneLoad.get(slot.zone_id) ?? 0;
  const zoneScore = 1 - load;
  const elevatorScore = normInverseDistance(slot.distance_to_elevator);

  let typeScore = 1;
  if (slot.slot_type && vehicleTypeCode) {
    const st = String(slot.slot_type).toLowerCase();
    const vt = String(vehicleTypeCode).toLowerCase();
    typeScore = st === vt || st.includes(vt) ? 1 : 0.3;
  }

  const prefScore = preferenceScore(slot, userPrefs);
  const prefWeight = userPrefs ? (weights.preference ?? 0) : 0;

  const score =
    weights.gate * gateScore +
    weights.zone_balance * zoneScore +
    weights.elevator * elevatorScore +
    weights.slot_type * typeScore +
    prefWeight * prefScore;

  return {
    score,
    breakdown: {
      gate: gateScore,
      zone: zoneScore,
      elevator: elevatorScore,
      slotType: typeScore,
      preference: prefScore,
    },
  };
};

export const rankSlots = async (
  slots,
  { vehicleTypeId, vehicleTypeCode, weights, topN = null, userPrefs = null },
) => {
  let typeCode = vehicleTypeCode;
  if (!typeCode && vehicleTypeId) {
    const vt = await VehicleType.findByPk(vehicleTypeId, { attributes: ['type_code'] });
    typeCode = vt?.type_code;
  }

  const zoneIds = [...new Set(slots.map((s) => s.zone_id))];
  const zoneLoad = await computeZoneLoad(zoneIds);

  const scored = slots
    .map((slot) => {
      const { score, breakdown } = scoreSlot(slot, {
        weights,
        zoneLoad,
        vehicleTypeCode: typeCode,
        userPrefs,
      });
      return { slot, score, breakdown };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.slot.slot_code.localeCompare(b.slot.slot_code);
    });

  return topN ? scored.slice(0, topN) : scored;
};

export const pickBestSlot = async (slots, { vehicleTypeId, topN = 0, userPrefs = null } = {}) => {
  const strategy = getSuggestStrategy();
  const weights = resolveScoreWeights(strategy, getSuggestScoreWeights());
  const ranked = await rankSlots(slots, {
    vehicleTypeId,
    weights,
    topN: topN || undefined,
    userPrefs,
  });
  const algorithm =
    userPrefs && strategy !== 'scoring' ? `${strategy}+personalized` : strategy === 'scoring' ? 'scoring' : strategy;

  return {
    ranked,
    selected: ranked[0] || null,
    algorithm,
    weights,
  };
};

export const buildScoreReason = (breakdown, { distanceToGate, distanceToElevator } = {}) => {
  const parts = [];
  if (breakdown?.gate > 0.55) parts.push('gần cổng');
  if (breakdown?.zone > 0.55) parts.push('khu ít tải');
  if (breakdown?.elevator > 0.55) parts.push('gần thang máy');
  if (breakdown?.slotType >= 0.95) parts.push('phù hợp loại xe');
  if (breakdown?.preference >= 0.95) parts.push('khu quen thuộc');
  else if (breakdown?.preference >= 0.7) parts.push('tầng hay dùng');
  if (parts.length === 0) parts.push('điểm tổng cao nhất');

  const dist =
    distanceToGate != null ? `~${Math.round(Number(distanceToGate))}m cổng` : null;
  const elev =
    distanceToElevator != null ? `~${Math.round(Number(distanceToElevator))}m thang máy` : null;
  const distPart = [dist, elev].filter(Boolean).join(', ');
  return distPart ? `${parts.join(', ')} (${distPart})` : parts.join(', ');
};
