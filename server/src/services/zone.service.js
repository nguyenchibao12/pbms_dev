import sequelize from '../config/db.js';
import { Zone, ParkingSlot, Floor, VehicleType } from '../models/index.js';
import { AppError } from '../utils/helpers.js';
import { assertZoneFitsFloorArea } from '../utils/floorCapacity.js';
import { buildZoneCode } from '../utils/zoneCode.js';
import { resyncZoneSlotCodes } from './parkingSlot.service.js';

const zoneIncludes = [
  { association: 'floor', attributes: ['floor_id', 'floor_code', 'label'] },
  { association: 'vehicleType', attributes: ['vehicle_type_id', 'type_name', 'type_code'] },
];

export const listZones = async (floorId) => {
  const where = floorId ? { floor_id: floorId } : {};
  return Zone.findAll({ where, include: zoneIncludes, order: [['zone_code', 'ASC']] });
};

export const getZone = async (id) => {
  const zone = await Zone.findByPk(id, {
    include: [...zoneIncludes, { association: 'parkingSlots' }],
  });
  if (!zone) throw new AppError('Zone not found', 404, 'NOT_FOUND');
  return zone;
};

// Xem trước mã khu sẽ sinh (cho FE hiển thị ô "Mã khu" chỉ đọc trước khi lưu).
export const previewNextZoneCode = async (floorId, vehicleTypeId) => {
  const floor = await Floor.findByPk(floorId);
  if (!floor) throw new AppError('Floor not found', 404, 'NOT_FOUND');
  const vehicleType = await VehicleType.findByPk(vehicleTypeId);
  if (!vehicleType) throw new AppError('Vehicle type not found', 404, 'NOT_FOUND');
  const zoneCode = await buildZoneCode(floor, vehicleType);
  return { zoneCode };
};

export const createZone = async (data) => {
  const floor = await Floor.findByPk(data.floorId);
  if (!floor) throw new AppError('Floor not found', 404, 'NOT_FOUND');

  // Tầng 1 loại xe (single) tự quản 1 khu mặc định → khóa tạo khu thủ công.
  if (floor.layout_mode === 'single') {
    throw new AppError(
      'Tầng dành riêng 1 loại xe (single) không cho tạo khu. Dùng tầng phân khu (zoned) để thêm khu.',
      409,
      'CONFLICT',
    );
  }

  const vehicleType = await VehicleType.findByPk(data.vehicleTypeId);
  if (!vehicleType) throw new AppError('Vehicle type not found', 404, 'NOT_FOUND');

  // Mã khu sinh tự động theo quy ước <TẦNG>-<LOẠI XE>-<NN> (không nhận nhập tự do).
  const zoneCode = await buildZoneCode(floor, vehicleType);

  const totalSlots = data.totalSlots ?? 0;
  // 0 = KHÔNG mở bán vé tháng (không phải "chưa cấu hình"). Đã bỏ fallback slots/4 vì nó khiến
  // Manager không có cách nào tắt bán ở một khu. Muốn bán phải set > 0.
  const monthlyPassCapacity = data.monthlyPassCapacity ?? 0;
  // Bán nhiều hơn số chỗ vật lý = hứa chỗ không tồn tại → khách có vé vẫn không có chỗ đỗ.
  if (monthlyPassCapacity > totalSlots) {
    throw new AppError(
      'monthlyPassCapacity cannot exceed totalSlots',
      400,
      'VALIDATION_ERROR',
    );
  }

  // Ràng buộc diện tích: Σ(slot × diện tích/slot) ≤ diện tích tầng.
  await assertZoneFitsFloorArea(floor, vehicleType, totalSlots, {});

  return Zone.create({
    floor_id: data.floorId,
    vehicle_type_id: data.vehicleTypeId,
    zone_code: zoneCode,
    label: data.label,
    total_slots: totalSlots,
    monthly_pass_capacity: monthlyPassCapacity,
  });
};

export const updateZone = async (id, data) => {
  const zone = await Zone.findByPk(id);
  if (!zone) throw new AppError('Zone not found', 404, 'NOT_FOUND');

  if (data.floorId) {
    const floor = await Floor.findByPk(data.floorId);
    if (!floor) throw new AppError('Floor not found', 404, 'NOT_FOUND');
  }
  if (data.vehicleTypeId) {
    const vehicleType = await VehicleType.findByPk(data.vehicleTypeId);
    if (!vehicleType) throw new AppError('Vehicle type not found', 404, 'NOT_FOUND');
  }

  const newFloorId = data.floorId ?? zone.floor_id;
  const newTotalSlots = data.totalSlots ?? zone.total_slots;
  const newCapacity = data.monthlyPassCapacity ?? zone.monthly_pass_capacity;

  const used = await ParkingSlot.count({ where: { zone_id: id } });
  if (newTotalSlots < used) {
    throw new AppError(
      `Không thể đặt total_slots = ${newTotalSlots} khi khu đang có ${used} slot. Xóa slot thừa trước.`,
      409,
      'CONFLICT',
    );
  }

  if (newCapacity > newTotalSlots) {
    throw new AppError(
      'monthlyPassCapacity cannot exceed totalSlots',
      400,
      'VALIDATION_ERROR',
    );
  }

  const targetFloor = await Floor.findByPk(newFloorId);
  const isMovingFloor = data.floorId != null && Number(data.floorId) !== zone.floor_id;
  const currentFloor = isMovingFloor ? await Floor.findByPk(zone.floor_id) : targetFloor;

  // Chỉ chặn DI CHUYỂN khu vào/ra tầng single (tầng single gắn cứng 1 khu mặc định).
  // Sửa TẠI CHỖ khu mặc định (total_slots / vé tháng) vẫn cho phép.
  if (
    isMovingFloor &&
    (targetFloor?.layout_mode === 'single' || currentFloor?.layout_mode === 'single')
  ) {
    throw new AppError(
      'Không thể di chuyển khu vào/ra tầng 1 loại xe (single).',
      409,
      'CONFLICT',
    );
  }
  // Khu thuộc tầng single: loại xe do tầng quản → đổi ở form sửa Tầng, không sửa tại khu.
  if (
    currentFloor?.layout_mode === 'single' &&
    data.vehicleTypeId != null &&
    Number(data.vehicleTypeId) !== zone.vehicle_type_id
  ) {
    throw new AppError(
      'Loại xe của tầng 1 loại xe được đổi ở form sửa Tầng, không sửa tại khu.',
      409,
      'CONFLICT',
    );
  }
  const newVehicleTypeId = data.vehicleTypeId ?? zone.vehicle_type_id;
  const newVehicleType = await VehicleType.findByPk(newVehicleTypeId);
  await assertZoneFitsFloorArea(targetFloor, newVehicleType, newTotalSlots, {
    excludeZoneId: zone.zone_id,
  });

  // Mã khu là tự sinh theo (tầng, loại xe) → khi đổi tầng/loại xe thì sinh lại cho khớp
  // quy ước; không cho sửa tay (bỏ qua data.zoneCode nếu có gửi lên).
  const codeNeedsRegen =
    newFloorId !== zone.floor_id || Number(newVehicleTypeId) !== zone.vehicle_type_id;
  const newZoneCode = codeNeedsRegen
    ? await buildZoneCode(targetFloor, newVehicleType, { excludeZoneId: zone.zone_id })
    : zone.zone_code;

  const fields = {
    floor_id: newFloorId,
    vehicle_type_id: newVehicleTypeId,
    zone_code: newZoneCode,
    label: data.label ?? zone.label,
    total_slots: newTotalSlots,
    monthly_pass_capacity: newCapacity,
  };

  if (codeNeedsRegen) {
    // Mã khu đổi (đổi tầng/loại xe) → mã chỗ con phải sinh lại theo mã khu mới, cùng 1 transaction.
    await sequelize.transaction(async (t) => {
      await zone.update(fields, { transaction: t });
      await resyncZoneSlotCodes(zone, t);
    });
  } else {
    await zone.update(fields);
  }
  return zone;
};

export const deleteZone = async (id) => {
  const zone = await Zone.findByPk(id);
  if (!zone) throw new AppError('Zone not found', 404, 'NOT_FOUND');

  const slotCount = await ParkingSlot.count({ where: { zone_id: id } });
  if (slotCount > 0) {
    throw new AppError('Cannot delete zone with existing parking slots', 409, 'CONFLICT');
  }

  await zone.destroy();
};
