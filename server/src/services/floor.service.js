import { Op } from 'sequelize';
import sequelize from '../config/db.js';
import { Floor, Zone, Gate, ParkingSlot, VehicleType } from '../models/index.js';
import { AppError } from '../utils/helpers.js';
import { bulkGenerateSlots, resyncZoneSlotCodes } from './parkingSlot.service.js';
import {
  maxSlotsForArea,
  assertZoneFitsFloorArea,
  assertFloorAreaMonotonic,
  computeFloorAreaUsed,
  getVehicleTypeOrThrow,
  slotAreaOf,
} from '../utils/floorCapacity.js';
import { buildZoneCode } from '../utils/zoneCode.js';
import { buildGateCode } from '../utils/gateCode.js';

/**
 * Mỗi cao độ chỉ được một tầng. floor_code unique nhưng floor_level thì không, nên trước đây
 * tạo được 2 tầng cùng ở cao độ 2 — tòa nhà không có hình dạng xác định để ràng buộc diện tích.
 */
const assertFloorLevelFree = async (floorLevel, { excludeFloorId } = {}, transaction) => {
  const where = { floor_level: Number(floorLevel) };
  if (excludeFloorId) where.floor_id = { [Op.ne]: Number(excludeFloorId) };
  const dup = await Floor.findOne({ where, transaction });
  if (dup) {
    throw new AppError(
      `Đã có tầng ở cao độ ${floorLevel} ("${dup.label || dup.floor_code}"). Mỗi cao độ chỉ một tầng.`,
      409,
      'CONFLICT',
    );
  }
};

export const listFloors = async () =>
  Floor.findAll({ order: [['floor_level', 'ASC']] });

export const getFloor = async (id) => {
  const floor = await Floor.findByPk(id, {
    include: [
      { association: 'vehicleType' },
      { association: 'zones', include: [{ association: 'vehicleType' }] },
      { association: 'gates' },
    ],
  });
  if (!floor) throw new AppError('Floor not found', 404, 'NOT_FOUND');

  const areaUsed = await computeFloorAreaUsed(floor.floor_id, {});
  const result = floor.toJSON();
  result.capacity = {
    areaM2: floor.area_m2 != null ? Number(floor.area_m2) : null,
    areaUsedM2: Number(areaUsed.toFixed(2)),
    areaFreeM2:
      floor.area_m2 != null ? Number((Number(floor.area_m2) - areaUsed).toFixed(2)) : null,
  };
  return result;
};

export const createFloor = async (data) => {
  const existing = await Floor.findOne({ where: { floor_code: data.floorCode } });
  if (existing) throw new AppError('Floor code already exists', 409, 'CONFLICT');

  const layoutMode = data.layoutMode === 'single' ? 'single' : 'zoned';
  const areaM2 = data.areaM2 != null ? Number(data.areaM2) : null;

  await assertFloorLevelFree(data.floorLevel);
  await assertFloorAreaMonotonic({ floorLevel: data.floorLevel, areaM2 });

  // Lv2 — tầng phân khu: chỉ tạo tầng, khu thêm sau (createZone).
  if (layoutMode === 'zoned') {
    return Floor.create({
      floor_code: data.floorCode,
      floor_level: data.floorLevel,
      label: data.label,
      layout_mode: 'zoned',
      vehicle_type_id: null,
      area_m2: areaM2,
    });
  }

  // Lv1 — tầng 1 loại xe: bắt buộc loại xe + diện tích, tự tạo 1 khu mặc định (khóa tạo khu).
  if (!data.vehicleTypeId) {
    throw new AppError('Tầng 1 loại xe (single) cần chọn loại xe (vehicleTypeId)', 400, 'VALIDATION_ERROR');
  }
  if (areaM2 == null || areaM2 <= 0) {
    throw new AppError('Tầng 1 loại xe (single) cần nhập diện tích tầng (areaM2 > 0)', 400, 'VALIDATION_ERROR');
  }
  const vt = await getVehicleTypeOrThrow(data.vehicleTypeId);
  const maxSlots = maxSlotsForArea(areaM2, slotAreaOf(vt));
  if (maxSlots < 1) {
    throw new AppError(
      `Diện tích ${areaM2} m² không đủ cho 1 slot loại "${vt.type_name}" (${slotAreaOf(vt)} m²/slot)`,
      400,
      'VALIDATION_ERROR',
    );
  }

  return sequelize.transaction(async (transaction) => {
    const floor = await Floor.create(
      {
        floor_code: data.floorCode,
        floor_level: data.floorLevel,
        label: data.label,
        layout_mode: 'single',
        vehicle_type_id: vt.vehicle_type_id,
        area_m2: areaM2,
      },
      { transaction },
    );
    // Khu mặc định: slot vẫn treo vào zone (giữ FK), sức chứa = maxSlots theo diện tích.
    await Zone.create(
      {
        floor_id: floor.floor_id,
        vehicle_type_id: vt.vehicle_type_id,
        zone_code: await buildZoneCode(floor, vt, { transaction }),
        label: `${data.label} - ${vt.type_name}`,
        total_slots: maxSlots,
        monthly_pass_capacity: 0,
      },
      { transaction },
    );
    return floor;
  });
};

export const updateFloor = async (id, data) => {
  const floor = await Floor.findByPk(id);
  if (!floor) throw new AppError('Floor not found', 404, 'NOT_FOUND');

  if (data.floorCode && data.floorCode !== floor.floor_code) {
    const existing = await Floor.findOne({ where: { floor_code: data.floorCode } });
    if (existing) throw new AppError('Floor code already exists', 409, 'CONFLICT');
  }

  // Đổi chế độ tầng đang có dữ liệu rất rủi ro → chặn, yêu cầu tạo tầng mới.
  if (data.layoutMode && data.layoutMode !== floor.layout_mode) {
    throw new AppError(
      'Không thể đổi layout_mode của tầng đã tạo. Tạo tầng mới với chế độ mong muốn.',
      409,
      'CONFLICT',
    );
  }

  // Đổi loại xe của tầng (chỉ áp cho tầng single — cả tầng 1 loại, không qua khu).
  let newVehicleTypeId = floor.vehicle_type_id;
  let changingVehicleType = false;
  if (data.vehicleTypeId != null && Number(data.vehicleTypeId) !== floor.vehicle_type_id) {
    if (floor.layout_mode !== 'single') {
      throw new AppError(
        'Chỉ tầng 1 loại xe (single) mới đặt loại xe ở cấp tầng. Tầng phân khu đổi loại xe tại từng khu.',
        400,
        'VALIDATION_ERROR',
      );
    }
    const vt = await getVehicleTypeOrThrow(data.vehicleTypeId);
    if (slotAreaOf(vt) <= 0) {
      throw new AppError(
        `Loại xe "${vt.type_name}" chưa cấu hình diện tích slot (slot_area_m2).`,
        400,
        'VALIDATION_ERROR',
      );
    }
    newVehicleTypeId = vt.vehicle_type_id;
    changingVehicleType = true;
  }

  let newArea = floor.area_m2 == null ? null : Number(floor.area_m2);
  if (data.areaM2 !== undefined) {
    newArea = data.areaM2 == null ? null : Number(data.areaM2);
    if (newArea == null && floor.layout_mode === 'single') {
      throw new AppError('Tầng 1 loại xe cần diện tích (areaM2), không thể bỏ trống', 400, 'VALIDATION_ERROR');
    }
    if (newArea != null) {
      if (newArea <= 0) throw new AppError('areaM2 phải > 0', 400, 'VALIDATION_ERROR');
      const used = await computeFloorAreaUsed(floor.floor_id, {});
      if (newArea + 1e-6 < used) {
        throw new AppError(
          `Diện tích mới ${newArea} m² nhỏ hơn diện tích đang dùng ${used.toFixed(1)} m². Giảm số slot/khu trước.`,
          409,
          'CONFLICT',
        );
      }
    }
  }

  const newLevel = data.floorLevel ?? floor.floor_level;
  if (Number(newLevel) !== floor.floor_level) {
    await assertFloorLevelFree(newLevel, { excludeFloorId: floor.floor_id });
  }
  // Đổi diện tích HOẶC dời cao độ đều có thể phá luật "không tăng khi lên cao" → kiểm giá trị SAU khi ghi.
  await assertFloorAreaMonotonic({
    floorLevel: newLevel,
    areaM2: newArea,
    excludeFloorId: floor.floor_id,
  });

  await floor.update({
    floor_code: data.floorCode ?? floor.floor_code,
    floor_level: newLevel,
    label: data.label ?? floor.label,
    area_m2: newArea,
    vehicle_type_id: newVehicleTypeId,
  });

  // Single: đổi diện tích HOẶC loại xe → đồng bộ khu mặc định (loại xe + sức chứa).
  // total_slots tính lại theo diện tích/slot của loại xe mới, không hạ dưới số slot đang có.
  const areaChanged = data.areaM2 !== undefined && newArea != null;
  if (floor.layout_mode === 'single' && (changingVehicleType || areaChanged) && newArea != null) {
    const vt = await VehicleType.findByPk(newVehicleTypeId);
    const defaultZone = await Zone.findOne({
      where: { floor_id: floor.floor_id },
      order: [['zone_id', 'ASC']],
    });
    if (vt && defaultZone) {
      const maxSlots = maxSlotsForArea(newArea, slotAreaOf(vt));
      const usedSlots = await ParkingSlot.count({ where: { zone_id: defaultZone.zone_id } });
      // Đổi loại xe → mã khu phải sinh lại theo loại xe mới (như createFloor/cloneFloor đã làm),
      // và mã chỗ con sinh lại theo mã khu mới để mã luôn "có nghĩa". Bọc transaction cho nhất quán.
      await sequelize.transaction(async (t) => {
        await defaultZone.update(
          {
            vehicle_type_id: newVehicleTypeId,
            total_slots: Math.max(maxSlots, usedSlots),
            zone_code: changingVehicleType
              ? await buildZoneCode(floor, vt, { excludeZoneId: defaultZone.zone_id, transaction: t })
              : defaultZone.zone_code,
          },
          { transaction: t },
        );
        if (changingVehicleType) await resyncZoneSlotCodes(defaultZone, t);
      });
    }
  }

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

    const floorArea = floorData.areaM2 != null ? Number(floorData.areaM2) : null;
    await assertFloorLevelFree(floorData.floorLevel, {}, transaction);
    await assertFloorAreaMonotonic(
      { floorLevel: floorData.floorLevel, areaM2: floorArea },
      transaction,
    );

    const floor = await Floor.create(
      {
        floor_code: floorData.floorCode,
        floor_level: floorData.floorLevel,
        label: floorData.label,
        layout_mode: 'zoned',
        vehicle_type_id: null,
        area_m2: floorArea,
      },
      { transaction },
    );

    const createdZones = [];
    let areaUsed = 0; // m² đã phân bổ cho các khu — chặn vượt diện tích tầng

    for (const zc of zoneConfigs) {
      const vt = await VehicleType.findByPk(zc.vehicleTypeId, { transaction });
      if (!vt) throw new AppError('Vehicle type not found', 404, 'NOT_FOUND');

      if (floorArea != null) {
        const slotArea = slotAreaOf(vt);
        if (slotArea <= 0) {
          throw new AppError(
            `Loại xe "${vt.type_name}" chưa cấu hình diện tích slot (slot_area_m2).`,
            400,
            'VALIDATION_ERROR',
          );
        }
        areaUsed += zc.slotCount * slotArea;
        if (areaUsed > floorArea + 1e-6) {
          throw new AppError(
            `Vượt diện tích tầng: các khu cần ${areaUsed.toFixed(1)} m² nhưng tầng chỉ có ${floorArea.toFixed(1)} m².`,
            409,
            'CONFLICT',
          );
        }
      }

      if ((zc.monthlyPassCapacity ?? 0) > zc.slotCount) {
        throw new AppError(
          `Zone "${zc.label}": monthlyPassCapacity cannot exceed slotCount`,
          400,
          'VALIDATION_ERROR',
        );
      }

      const zone = await Zone.create(
        {
          floor_id: floor.floor_id,
          vehicle_type_id: zc.vehicleTypeId,
          zone_code: await buildZoneCode(floor, vt, { transaction }),
          label: zc.label,
          total_slots: zc.slotCount,
          monthly_pass_capacity: zc.monthlyPassCapacity ?? 0,
        },
        { transaction },
      );

      const slotResult = await bulkGenerateSlots(
        zone.zone_id,
        {
          count: zc.slotCount,
          // Mã chỗ tự sinh <mã khu>-NN (không còn dùng codePrefix/startIndex/padding).
          distanceStart: zc.distanceStart ?? null,
          distanceStep: zc.distanceStep ?? null,
        },
        transaction,
      );

      createdZones.push({ zone, slots: slotResult });
    }

    const createdGates = [];
    if (gateOpts?.auto) {
      // Mỗi tầng chỉ 1 cổng IN + 1 cổng OUT (cổng không gắn loại xe) — mã tự sinh <TẦNG>-<IN|OUT>.
      for (const [direction, dirLabel] of [['in', 'vào'], ['out', 'ra']]) {
        const gateCode = buildGateCode(floor, direction);
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
            label: `Cổng ${dirLabel} — ${floor.label}`,
            is_active: true,
          },
          { transaction },
        );
        createdGates.push(gate);
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

  const created = await sequelize.transaction(async (transaction) => {
    const existing = await Floor.findOne({ where: { floor_code: floorCode }, transaction });
    if (existing) throw new AppError('Floor code already exists', 409, 'CONFLICT');

    await assertFloorLevelFree(floorLevel, {}, transaction);
    await assertFloorAreaMonotonic(
      { floorLevel, areaM2: source.area_m2 },
      transaction,
    );

    // Nhân bản = giữ NGUYÊN cấu hình tầng nguồn. Trước đây chỉ copy code/level/label, bỏ sót
    // area_m2 → tầng clone thành NULL = KHÔNG giới hạn diện tích, thoát mọi ràng buộc sức chứa
    // dù các khu vẫn được copy y hệt. layout_mode/vehicle_type_id cũng vậy (single hóa thành zoned).
    const newFloor = await Floor.create(
      {
        floor_code: floorCode,
        floor_level: floorLevel,
        label,
        layout_mode: source.layout_mode,
        vehicle_type_id: source.vehicle_type_id,
        area_m2: source.area_m2,
      },
      { transaction },
    );

    for (const zone of source.zones) {
      const vt = await VehicleType.findByPk(zone.vehicle_type_id, { transaction });
      const newZone = await Zone.create(
        {
          floor_id: newFloor.floor_id,
          vehicle_type_id: zone.vehicle_type_id,
          // Sinh lại mã theo tầng mới (vd F1-CAR-01 → F4-CAR-01) cho đúng quy ước.
          zone_code: await buildZoneCode(newFloor, vt, { transaction }),
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
            distance_to_gate: s.distance_to_gate,
          })),
          { transaction },
        );
      }
    }

    for (const gate of source.gates) {
      // Mã cổng tự sinh theo tầng mới + hướng (vd F1-IN → F4-IN); cổng không còn gắn loại xe.
      await Gate.create(
        {
          floor_id: newFloor.floor_id,
          gate_code: buildGateCode(newFloor, gate.direction),
          direction: gate.direction,
          label: gate.label,
          is_active: gate.is_active,
        },
        { transaction },
      );
    }

    return newFloor;
  });

  // getFloor đọc bằng connection khác nên KHÔNG thấy row chưa commit → gọi trong transaction
  // là 404 rồi rollback (clone hỏng hoàn toàn). Chỉ đọc lại sau khi transaction đã commit.
  return getFloor(created.floor_id);
};
