import { Zone, ParkingSlot, Floor, VehicleType } from '../models/index.js';
import { AppError } from '../utils/helpers.js';
import { assertZoneFitsFloorArea } from '../utils/floorCapacity.js';

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

  const existing = await Zone.findOne({
    where: { floor_id: data.floorId, zone_code: data.zoneCode },
  });
  if (existing) throw new AppError('Zone code already exists on this floor', 409, 'CONFLICT');

  const totalSlots = data.totalSlots ?? 0;
  const monthlyPassCapacity = data.monthlyPassCapacity ?? 0;
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
    zone_code: data.zoneCode,
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
  const newZoneCode = data.zoneCode ?? zone.zone_code;
  if (newZoneCode !== zone.zone_code || newFloorId !== zone.floor_id) {
    const existing = await Zone.findOne({
      where: { floor_id: newFloorId, zone_code: newZoneCode },
    });
    if (existing && existing.zone_id !== zone.zone_id) {
      throw new AppError('Zone code already exists on this floor', 409, 'CONFLICT');
    }
  }

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
  if (targetFloor?.layout_mode === 'single') {
    throw new AppError(
      'Không thể sửa/di chuyển khu vào tầng 1 loại xe (single). Chỉnh diện tích tầng thay thế.',
      409,
      'CONFLICT',
    );
  }
  const newVehicleType = await VehicleType.findByPk(data.vehicleTypeId ?? zone.vehicle_type_id);
  await assertZoneFitsFloorArea(targetFloor, newVehicleType, newTotalSlots, {
    excludeZoneId: zone.zone_id,
  });

  await zone.update({
    floor_id: newFloorId,
    vehicle_type_id: data.vehicleTypeId ?? zone.vehicle_type_id,
    zone_code: newZoneCode,
    label: data.label ?? zone.label,
    total_slots: newTotalSlots,
    monthly_pass_capacity: newCapacity,
  });
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
