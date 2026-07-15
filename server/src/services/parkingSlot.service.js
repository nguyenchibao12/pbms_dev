import sequelize from '../config/db.js';
import ParkingSlot, { SLOT_STATUSES } from '../models/parkingSlot.model.js';
import { Zone } from '../models/index.js';
import { AppError } from '../utils/helpers.js';
import { assertSlotTransition } from '../utils/stateGuards.js';
import { buildSlotCode, nextSlotCode } from '../utils/slotCode.js';

const slotIncludes = [
  {
    association: 'zone',
    attributes: ['zone_id', 'zone_code', 'label', 'floor_id'],
    include: [{ association: 'floor', attributes: ['floor_id', 'floor_code', 'label'] }],
  },
];

const validateStatusChange = (currentStatus, newStatus) => {
  if (currentStatus === newStatus) return;

  const systemManaged = ['reserved', 'occupied'];
  if (systemManaged.includes(currentStatus)) {
    throw new AppError(
      `Cannot manually change slot status from "${currentStatus}"`,
      409,
      'CONFLICT'
    );
  }

  const allowedManual = ['available', 'maintenance', 'locked'];
  if (!allowedManual.includes(newStatus)) {
    throw new AppError(
      `Manual status update only allowed to: ${allowedManual.join(', ')}`,
      400,
      'VALIDATION_ERROR'
    );
  }
};

export const listParkingSlots = async (zoneId) => {
  const where = zoneId ? { zone_id: zoneId } : {};
  return ParkingSlot.findAll({ where, include: slotIncludes, order: [['slot_code', 'ASC']] });
};

export const getParkingSlot = async (id) => {
  const slot = await ParkingSlot.findByPk(id, { include: slotIncludes });
  if (!slot) throw new AppError('Parking slot not found', 404, 'NOT_FOUND');
  return slot;
};

/** Xem trước mã chỗ kế tiếp của 1 khu (FE hiển thị read-only). */
export const previewNextSlotCode = async (zoneId) => {
  const zone = await Zone.findByPk(zoneId);
  if (!zone) throw new AppError('Zone not found', 404, 'NOT_FOUND');
  return { slotCode: await nextSlotCode(zone) };
};

export const createParkingSlot = async (data) => {
  const zone = await Zone.findByPk(data.zoneId);
  if (!zone) throw new AppError('Zone not found', 404, 'NOT_FOUND');

  const used = await ParkingSlot.count({ where: { zone_id: data.zoneId } });
  if (used >= zone.total_slots) {
    throw new AppError(
      `Khu ${zone.zone_code} đã đủ ${zone.total_slots} slot. Tăng "Tổng số slot" trước khi thêm.`,
      409,
      'CONFLICT',
    );
  }

  const status = data.status || 'available';
  if (!SLOT_STATUSES.includes(status)) {
    throw new AppError('Invalid slot status', 400, 'VALIDATION_ERROR');
  }
  if (status !== 'available' && status !== 'maintenance' && status !== 'locked') {
    throw new AppError('New slots must start as available, maintenance, or locked', 400, 'VALIDATION_ERROR');
  }

  // Mã chỗ tự sinh theo <mã khu>-NN (không nhận slotCode nhập tự do).
  const slotCode = await nextSlotCode(zone);

  return ParkingSlot.create({
    zone_id: data.zoneId,
    slot_code: slotCode,
    status,
    slot_type: data.slotType || null,
    distance_to_gate: data.distanceToGate ?? null,
  });
};

export const updateParkingSlot = async (id, data) => {
  const slot = await ParkingSlot.findByPk(id);
  if (!slot) throw new AppError('Parking slot not found', 404, 'NOT_FOUND');

  // Chuyển chỗ sang khu khác → mã chỗ sinh lại theo mã khu đích (mã không nhập tự do).
  let newSlotCode = slot.slot_code;
  if (data.zoneId && Number(data.zoneId) !== slot.zone_id) {
    // Chỗ đang có xe (occupied) hoặc đang giữ (reserved) mà đổi khu → phiên/đơn đang gắn chỗ
    // này sẽ lệch tầng (cổng tầng/RA báo wrong_floor, barrier không mở → khách kẹt). Chặn như
    // deleteParkingSlot. Chờ xe ra / hủy giữ chỗ rồi mới chuyển.
    if (slot.status === 'occupied' || slot.status === 'reserved') {
      throw new AppError(
        'Không thể chuyển khu cho chỗ đang có xe hoặc đang được giữ. Chờ xe ra / hủy giữ chỗ trước.',
        409,
        'CONFLICT',
      );
    }
    const targetZone = await Zone.findByPk(data.zoneId);
    if (!targetZone) throw new AppError('Zone not found', 404, 'NOT_FOUND');

    const used = await ParkingSlot.count({ where: { zone_id: data.zoneId } });
    if (used >= targetZone.total_slots) {
      throw new AppError(
        `Khu đích ${targetZone.zone_code} đã đủ ${targetZone.total_slots} slot.`,
        409,
        'CONFLICT',
      );
    }
    newSlotCode = await nextSlotCode(targetZone);
  }

  const newZoneId = data.zoneId ?? slot.zone_id;

  if (data.status) {
    validateStatusChange(slot.status, data.status);
  }

  await slot.update({
    zone_id: newZoneId,
    slot_code: newSlotCode,
    status: data.status ?? slot.status,
    slot_type: data.slotType !== undefined ? data.slotType : slot.slot_type,
    distance_to_gate:
      data.distanceToGate !== undefined ? data.distanceToGate : slot.distance_to_gate,
  });
  return getParkingSlot(id);
};

/**
 * Tạo N slot trong 1 transaction theo mẫu mã. Bỏ qua mã đã tồn tại (idempotent).
 */
export const bulkGenerateSlots = async (zoneId, opts, externalTransaction = null) => {
  // Khi chạy trong transaction (vd quickSetupFloor), các read phải dùng cùng transaction
  // để thấy zone vừa tạo (chưa commit) — nếu không sẽ "Zone not found" và rollback.
  const readOpt = externalTransaction ? { transaction: externalTransaction } : {};

  const zone = await Zone.findByPk(zoneId, readOpt);
  if (!zone) throw new AppError('Zone not found', 404, 'NOT_FOUND');

  const {
    count,
    distanceStart = null,
    distanceStep = null,
    slotType = null,
  } = opts;

  const existingSlots = await ParkingSlot.findAll({
    where: { zone_id: zoneId },
    attributes: ['slot_code'],
    ...readOpt,
  });
  const existingCodes = new Set(existingSlots.map((s) => s.slot_code));

  // Cap cứng: chỉ tạo tối đa (total_slots - số slot đang có) slot.
  const used = existingSlots.length;
  const remaining = Math.max(zone.total_slots - used, 0);

  // Mã tự sinh <mã khu>-NN, nối tiếp NN lớn nhất hiện có của khu.
  let maxNum = 0;
  for (const code of existingCodes) {
    const m = /-(\d+)$/.exec(code);
    if (m) maxNum = Math.max(maxNum, Number(m[1]));
  }
  const startNum = maxNum + 1;

  const toCreate = [];
  let skipped = 0;
  let cappedOut = 0;

  for (let i = 0; i < count; i++) {
    const code = buildSlotCode(zone, startNum + i);
    if (existingCodes.has(code)) {
      skipped += 1;
      continue;
    }
    if (toCreate.length >= remaining) {
      cappedOut += 1;
      continue;
    }
    existingCodes.add(code);

    let distance = null;
    if (distanceStart != null) {
      const step = distanceStep != null ? Number(distanceStep) : 0;
      distance = Number(distanceStart) + i * step;
    }

    toCreate.push({
      zone_id: zoneId,
      slot_code: code,
      status: 'available',
      slot_type: slotType || null,
      distance_to_gate: distance,
    });
  }

  const run = async (transaction) => {
    let created = 0;
    if (toCreate.length > 0) {
      await ParkingSlot.bulkCreate(toCreate, { transaction });
      created = toCreate.length;
    }
    return { created, skipped, cappedOut, totalSlots: used + created };
  };

  if (externalTransaction) return run(externalTransaction);
  return sequelize.transaction(run);
};

/**
 * Sinh lại slot_code cho TOÀN BỘ chỗ trong khu theo zone_code HIỆN TẠI của khu.
 * Dùng khi mã khu đổi (đổi loại xe / chuyển tầng) để mã chỗ con khớp mã khu mới
 * (vd F3-BIKE-01-NN → F3-CAR7-01-NN). `zone` truyền vào phải mang zone_code MỚI.
 * An toàn với unique (zone_id, slot_code): prefix mới khác prefix cũ nên không đụng mã cũ.
 * Đánh số lại 01..NN theo slot_id để thứ tự ổn định. Nên chạy trong cùng transaction
 * với lệnh update khu (truyền externalTransaction) để nhất quán.
 */
export const resyncZoneSlotCodes = async (zone, externalTransaction = null) => {
  const run = async (transaction) => {
    const slots = await ParkingSlot.findAll({
      where: { zone_id: zone.zone_id },
      order: [['slot_id', 'ASC']],
      transaction,
    });
    let i = 1;
    for (const s of slots) {
      const code = buildSlotCode(zone, i);
      if (s.slot_code !== code) await s.update({ slot_code: code }, { transaction });
      i += 1;
    }
    return slots.length;
  };
  if (externalTransaction) return run(externalTransaction);
  return sequelize.transaction(run);
};

export const deleteParkingSlot = async (id) => {
  const slot = await ParkingSlot.findByPk(id);
  if (!slot) throw new AppError('Parking slot not found', 404, 'NOT_FOUND');

  if (slot.status === 'occupied' || slot.status === 'reserved') {
    throw new AppError('Cannot delete slot that is occupied or reserved', 409, 'CONFLICT');
  }

  await slot.destroy();
};

export const updateSlotStatus = async (id, newStatus) => {
  const slot = await ParkingSlot.findByPk(id);
  if (!slot) throw new AppError('Parking slot not found', 404, 'NOT_FOUND');
  validateStatusChange(slot.status, newStatus);
  assertSlotTransition(slot.status, newStatus);
  await slot.update({ status: newStatus });
  return getParkingSlot(id);
};

export { SLOT_STATUSES };
