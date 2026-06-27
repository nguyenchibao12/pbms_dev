import { Zone, VehicleType } from '../models/index.js';
import { AppError } from './helpers.js';

/**
 * Sức chứa tầng tính theo DIỆN TÍCH.
 *
 * Mỗi loại xe chiếm diện tích khác nhau (VehicleType.slot_area_m2, đã gộp lối đi),
 * nên không đếm "số slot" chung mà quy về m²:
 *   diện tích đã dùng của tầng = Σ (zone.total_slots × loạiXe.slot_area_m2)
 * Ràng buộc: diện tích đã dùng ≤ floor.area_m2 (nếu floor có đặt area_m2).
 */

export const slotAreaOf = (vehicleType) => Number(vehicleType?.slot_area_m2 ?? 0);

/** Số slot tối đa của 1 loại xe vừa trong một diện tích cho trước. */
export const maxSlotsForArea = (areaM2, slotAreaM2) => {
  const area = Number(areaM2);
  const per = Number(slotAreaM2);
  if (!Number.isFinite(area) || area <= 0) return 0;
  if (!Number.isFinite(per) || per <= 0) {
    throw new AppError(
      'Loại xe chưa cấu hình diện tích slot (slot_area_m2). Cập nhật loại xe trước.',
      400,
      'VALIDATION_ERROR',
    );
  }
  return Math.floor(area / per);
};

/**
 * Tổng diện tích các khu đang chiếm trên 1 tầng.
 * @param {number} floorId
 * @param {object} opts { excludeZoneId } — bỏ qua 1 khu (khi đang sửa chính khu đó)
 */
export const computeFloorAreaUsed = async (floorId, { excludeZoneId } = {}, transaction) => {
  const zones = await Zone.findAll({
    where: { floor_id: floorId },
    include: [{ association: 'vehicleType', attributes: ['vehicle_type_id', 'slot_area_m2'] }],
    transaction,
  });
  let areaUsed = 0;
  for (const z of zones) {
    if (excludeZoneId && z.zone_id === Number(excludeZoneId)) continue;
    areaUsed += Number(z.total_slots) * slotAreaOf(z.vehicleType);
  }
  return areaUsed;
};

/**
 * Chặn nếu thêm/sửa một khu làm tổng diện tích vượt sức chứa tầng.
 * Không làm gì nếu floor.area_m2 chưa đặt (NULL = không giới hạn — legacy).
 *
 * @param floor          instance Floor
 * @param vehicleType    instance VehicleType của khu
 * @param totalSlots     total_slots dự kiến của khu
 * @param opts           { excludeZoneId } khi đang sửa khu hiện có
 */
export const assertZoneFitsFloorArea = async (
  floor,
  vehicleType,
  totalSlots,
  { excludeZoneId } = {},
  transaction,
) => {
  if (floor.area_m2 == null) return; // không giới hạn diện tích
  const floorArea = Number(floor.area_m2);
  const slotArea = slotAreaOf(vehicleType);
  if (slotArea <= 0) {
    throw new AppError(
      `Loại xe "${vehicleType.type_name}" chưa cấu hình diện tích slot (slot_area_m2).`,
      400,
      'VALIDATION_ERROR',
    );
  }

  const usedByOthers = await computeFloorAreaUsed(floor.floor_id, { excludeZoneId }, transaction);
  const wanted = Number(totalSlots) * slotArea;
  if (usedByOthers + wanted > floorArea + 1e-6) {
    const free = Math.max(floorArea - usedByOthers, 0);
    const fitSlots = Math.floor(free / slotArea);
    throw new AppError(
      `Vượt diện tích tầng: cần ${wanted.toFixed(1)} m² nhưng chỉ còn ${free.toFixed(1)}/${floorArea.toFixed(1)} m² ` +
        `(tối đa ${fitSlots} slot loại "${vehicleType.type_name}").`,
      409,
      'CONFLICT',
    );
  }
};

export const getVehicleTypeOrThrow = async (vehicleTypeId, transaction) => {
  const vt = await VehicleType.findByPk(vehicleTypeId, { transaction });
  if (!vt) throw new AppError('Vehicle type not found', 404, 'NOT_FOUND');
  return vt;
};
