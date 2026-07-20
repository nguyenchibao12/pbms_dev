import { Op } from 'sequelize';
import { ParkingSlot, Zone, Reservation, ParkingSession } from '../models/index.js';

export const BLOCKING_RESERVATION_STATUSES = ['pending', 'confirmed', 'checked_in'];

const slotIncludes = [
  {
    association: 'zone',
    attributes: ['zone_id', 'zone_code', 'label', 'floor_id'],
    include: [{ association: 'floor', attributes: ['floor_id', 'floor_code', 'label'] }],
  },
];

export const resolveZoneIds = async ({ floorId, vehicleTypeId, zoneId }) => {
  const zoneWhere = { floor_id: floorId, vehicle_type_id: vehicleTypeId };
  if (zoneId) zoneWhere.zone_id = zoneId;

  const zones = await Zone.findAll({ where: zoneWhere, attributes: ['zone_id'] });
  return zones.map((z) => z.zone_id);
};

/**
 * Slots free for [startTime, endTime] — OR-02: loại trừ reservation trùng khung và xe đang đỗ.
 */
export const findSlotsAvailableForWindow = async ({
  floorId,
  vehicleTypeId,
  zoneId,
  startTime,
  endTime,
}) => {
  const start = new Date(startTime);
  const end = new Date(endTime);

  const zoneIds = await resolveZoneIds({ floorId, vehicleTypeId, zoneId });
  if (zoneIds.length === 0) {
    return { slots: [], totalSlots: 0, zoneIds: [], blockedSlotIds: new Set() };
  }

  const allSlots = await ParkingSlot.findAll({
    where: {
      zone_id: { [Op.in]: zoneIds },
      status: { [Op.notIn]: ['maintenance', 'locked'] },
    },
    include: slotIncludes,
  });

  const slotIds = allSlots.map((s) => s.slot_id);
  if (slotIds.length === 0) {
    return { slots: [], totalSlots: 0, zoneIds, blockedSlotIds: new Set() };
  }

  const [overlappingReservations, activeSessions] = await Promise.all([
    Reservation.findAll({
      where: {
        slot_id: { [Op.in]: slotIds },
        status: { [Op.in]: BLOCKING_RESERVATION_STATUSES },
        start_time: { [Op.lt]: end },
        end_time: { [Op.gt]: start },
      },
      attributes: ['slot_id'],
    }),
    ParkingSession.findAll({
      where: { slot_id: { [Op.in]: slotIds }, status: 'active' },
      attributes: ['slot_id'],
    }),
  ]);

  const blockedSlotIds = new Set([
    ...overlappingReservations.map((r) => r.slot_id),
    ...activeSessions.map((s) => s.slot_id),
  ]);

  // KHÓA-ĐẦU-CA: 'reserved' = slot ĐÃ GIỮ cho một đơn tới ca (job materialize) → KHÔNG phải
  // ứng viên cho ai khác. Slot đó cũng đã bị chặn qua blockedSlotIds (đơn confirmed trỏ vào nó),
  // nhưng lọc thẳng theo status cho chắc: chỉ 'available' mới là ứng viên. Đơn tự chiếm slot
  // ĐÃ-GIỮ-của-mình bằng occupySlotForReservation (nhận cả 'reserved'), không qua hàm này.
  const slots = allSlots
    .filter((s) => !blockedSlotIds.has(s.slot_id))
    .filter((s) => s.status === 'available');

  return {
    slots,
    totalSlots: allSlots.length,
    availableCount: slots.length,
    zoneIds,
    blockedSlotIds,
    blockedByReservation: new Set(overlappingReservations.map((r) => r.slot_id)).size,
    blockedByActiveSession: new Set(activeSessions.map((s) => s.slot_id)).size,
  };
};

export const NO_SLOT_FOR_WINDOW_MESSAGE =
  'Không còn chỗ trống trong khung giờ bạn chọn. Vui lòng thử giờ khác, tầng khác hoặc rút ngắn thời lượng.';
