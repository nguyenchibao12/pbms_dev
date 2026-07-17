import { Op } from 'sequelize';
import { Zone, ParkingSession, ParkingSlot } from '../models/index.js';

/**
 * OR-03 — capacity vé tháng do Manager cấu hình TƯỜNG MINH theo zone.
 * Trả về đúng tổng monthly_pass_capacity của các khu (floor, vehicleType).
 * capacity = 0 nghĩa là "không mở bán vé tháng ở tầng/loại xe này" (KHÔNG tự suy default) —
 * để Manager tắt bán được. Khu muốn bán phải set capacity > 0 (≤ total_slots).
 * Truyền { transaction, lock } để KHÓA các row Zone khi đếm-rồi-tạo vé (chống bán vượt suất).
 */
export const getPassCapacity = async (floorId, vehicleTypeId, { transaction = null, lock = null } = {}) => {
  const zones = await Zone.findAll({
    where: { floor_id: floorId, vehicle_type_id: vehicleTypeId },   // các khu cùng (tầng, loại xe)
    ...(transaction ? { transaction } : {}),
    // lock = LOCK.UPDATE: khóa row Zone khi "đếm rồi tạo" vé, chống 2 request cùng thấy còn 1 suất.
    ...(lock ? { lock } : {}),
  });
  // Cộng dồn vì 1 (tầng, loại xe) có thể có nhiều khu; khu để 0 đóng góp 0 = không bán ở khu đó.
  return zones.reduce((sum, z) => sum + Number(z.monthly_pass_capacity || 0), 0);
};

export const countActivePassSessionsOnFloor = async (floorId, vehicleTypeId) => {
  const zones = await Zone.findAll({
    where: { floor_id: floorId, vehicle_type_id: vehicleTypeId },
    attributes: ['zone_id'],
  });
  const zoneIds = zones.map((z) => z.zone_id);
  if (zoneIds.length === 0) return 0;

  return ParkingSession.count({
    where: {
      status: 'active',
      session_type: 'monthly_pass',
    },
    include: [
      {
        association: 'slot',
        required: true,
        where: { zone_id: { [Op.in]: zoneIds } },
        attributes: [],
      },
    ],
  });
};

export const countActivePassSessionsInZone = async (zoneId) =>
  ParkingSession.count({
    where: { status: 'active', session_type: 'monthly_pass' },
    include: [
      { association: 'slot', required: true, where: { zone_id: zoneId }, attributes: [] },
    ],
  });

/**
 * Walk-in không chiếm phần capacity dành cho vé tháng (OR-03). "Headroom" = số chỗ phải ĐỂ DÀNH cho
 * khách vé tháng chưa vào = capacity − đang đỗ; họ trả cả tháng để được bảo đảm có chỗ.
 */
export const getZonePassHeadroom = async (zoneId) => {
  const zone = await Zone.findByPk(zoneId);
  if (!zone) return 0;
  const capacity = Number(zone.monthly_pass_capacity || 0);
  if (capacity <= 0) return 0;                        // khu không bán vé tháng → không phải để dành
  const active = await countActivePassSessionsInZone(zoneId);  // xe vé tháng ĐANG đỗ trong khu
  return Math.max(0, capacity - active);              // → số người có vé còn có thể tới
};

/** Lọc bỏ các chỗ mà walk-in KHÔNG được phép nhận (vì đang để dành cho vé tháng). */
export const filterWalkInCandidateSlots = async (slots) => {
  if (!slots.length) return [];

  const byZone = new Map();                           // gom chỗ theo khu: headroom tính THEO KHU
  slots.forEach((slot) => {
    const key = slot.zone_id;
    if (!byZone.has(key)) byZone.set(key, []);
    byZone.get(key).push(slot);
  });

  const allowed = [];
  for (const [zoneId, zoneSlots] of byZone) {
    const headroom = await getZonePassHeadroom(zoneId);
    // Còn 5 trống / để dành 3 → 5 > 3, walk-in vào được. Còn 3 / để dành 3 → loại cả khu.
    if (zoneSlots.length > headroom) {
      allowed.push(...zoneSlots);
    }
  }
  return allowed;
};
