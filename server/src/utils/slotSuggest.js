import { Op } from 'sequelize';
import { ParkingSlot } from '../models/index.js';
import { AppError } from './helpers.js';
import {
  findSlotsAvailableForWindow,
  resolveZoneIds,
  NO_SLOT_FOR_WINDOW_MESSAGE,
} from './slotWindow.js';
import { filterWalkInCandidateSlots } from './passCapacity.js';
import { filterWalkInCandidatesForUpcomingReservations } from './reservationCapacity.js';
import { assertSlotTransition } from './stateGuards.js';
import { pickBestSlot } from './slotScoring.js';

const mapTopCandidate = ({ slot, score, breakdown }) => ({
  slotId: slot.slot_id,
  slotCode: slot.slot_code,
  zoneCode: slot.zone?.zone_code ?? null,
  score: Math.round(score * 1000) / 1000,
  breakdown,
  distanceToGate: slot.distance_to_gate != null ? Number(slot.distance_to_gate) : null,
});

/**
 * Suggest an available slot. Returns slot + metadata for ai_log.
 * Reservation: truyền startTime + endTime để lọc theo khung giờ (OR-02).
 * topN > 0 → trả thêm topCandidates (preview UX).
 */
export const suggestSlot = async ({
  floorId,
  vehicleTypeId,
  zoneId,
  startTime,
  endTime,
  topN = 0,
  userPrefs = null,
  // true = bỏ qua lớp giữ-chỗ-cho-đơn-đặt (holdback): dùng cho check-in VÉ THÁNG —
  // vé tháng có cam kết sức chứa riêng, để holdback chặn là khóa oan người có vé.
  skipReservationHoldback = false,
}) => {
  const started = Date.now();

  const zoneIds = await resolveZoneIds({ floorId, vehicleTypeId, zoneId });
  if (zoneIds.length === 0) {
    throw new AppError(
      'Không có khu đỗ cho tầng và loại xe này. Vui lòng chọn loại xe hoặc tầng khác.',
      404,
      'NOT_FOUND',
    );
  }

  let slots;
  if (startTime && endTime) {
    const windowResult = await findSlotsAvailableForWindow({
      floorId,
      vehicleTypeId,
      zoneId,
      startTime,
      endTime,
    });
    slots = windowResult.slots;
    if (slots.length === 0) {
      throw new AppError(NO_SLOT_FOR_WINDOW_MESSAGE, 409, 'NO_SLOT_FOR_WINDOW');
    }
  } else {
    slots = await ParkingSlot.findAll({
      where: {
        zone_id: { [Op.in]: zoneIds },
        status: 'available',
      },
      include: [
        {
          association: 'zone',
          attributes: ['zone_id', 'zone_code', 'label', 'floor_id'],
          include: [{ association: 'floor', attributes: ['floor_id', 'floor_code', 'label'] }],
        },
      ],
    });

    if (slots.length === 0) {
      throw new AppError('No available parking slot', 409, 'CONFLICT');
    }
    slots = await filterWalkInCandidateSlots(slots);
    if (slots.length === 0) {
      throw new AppError(
        'Không còn chỗ walk-in — phần capacity đang dành cho vé tháng (OR-03)',
        409,
        'PASS_CAPACITY_RESERVED',
      );
    }
    // Mô hình suất (migration 008): đơn đặt không ghim slot nên walk-in phải CHỪA CHỖ cho
    // các đơn bắt đầu trong chân trời holdback — đây chính là lời cam kết "đặt là chắc có chỗ".
    if (!skipReservationHoldback) {
      slots = await filterWalkInCandidatesForUpcomingReservations(slots, {
        floorId,
        vehicleTypeId,
      });
      if (slots.length === 0) {
        throw new AppError(
          'Không còn chỗ walk-in — đang giữ chỗ cho các đơn đặt sắp tới',
          409,
          'WALKIN_HELD_FOR_RESERVATIONS',
        );
      }
    }
  }

  const { ranked, selected, algorithm } = await pickBestSlot(slots, {
    vehicleTypeId,
    topN: topN > 0 ? topN : 0,
    userPrefs,
  });

  if (!selected) {
    throw new AppError('No available parking slot', 409, 'CONFLICT');
  }

  return {
    slot: selected.slot,
    // Danh sách ứng viên đã xếp hạng (best-first) để caller retry khi lock thua race (3.4).
    rankedSlots: ranked.map((r) => r.slot),
    meta: {
      algorithm,
      candidatesCount: slots.length,
      executedTimeMs: Date.now() - started,
      selectedSlotId: selected.slot.slot_id,
      score: Math.round(selected.score * 1000) / 1000,
      floorId,
      vehicleTypeId,
      topCandidates: topN > 0 ? ranked.slice(0, topN).map(mapTopCandidate) : undefined,
    },
  };
};

export const lockSlotOccupied = async (slotId, transaction) => {
  const slot = await ParkingSlot.findByPk(slotId, { transaction, lock: true });
  if (!slot) throw new AppError('Parking slot not found', 404, 'NOT_FOUND');
  if (slot.status !== 'available') {
    throw new AppError(`Slot is not available (current: ${slot.status})`, 409, 'CONFLICT');
  }
  assertSlotTransition(slot.status, 'occupied');
  await slot.update({ status: 'occupied' }, { transaction });
  return slot;
};

export const releaseSlot = async (slotId, transaction) => {
  const slot = await ParkingSlot.findByPk(slotId, { transaction, lock: true });
  if (!slot) throw new AppError('Parking slot not found', 404, 'NOT_FOUND');

  if (slot.status !== 'occupied') {
    throw new AppError(`Cannot release slot with status "${slot.status}"`, 409, 'CONFLICT');
  }
  assertSlotTransition(slot.status, 'available');
  await slot.update({ status: 'available' }, { transaction });
};

// Nhả slot CHỈ KHI đang 'occupied' (idempotent) — dùng cho điểm nhả ở cổng OUT tầng,
// nơi có thể bị quét lại hoặc slot đã được nhả trước đó. Không 'occupied' -> bỏ qua.
export const releaseSlotIfOccupied = async (slotId, transaction) => {
  const slot = await ParkingSlot.findByPk(slotId, { transaction, lock: true });
  if (!slot) throw new AppError('Parking slot not found', 404, 'NOT_FOUND');
  if (slot.status !== 'occupied') return false;
  assertSlotTransition(slot.status, 'available');
  await slot.update({ status: 'available' }, { transaction });
  return true;
};

/**
 * Chiếm slot khi CHECK-IN ĐƠN ĐẶT (mô hình suất — slot gán lúc check-in như vé tháng).
 * Hợp lệ từ 'available' (bình thường) và cả 'reserved' (cờ DI SẢN trước migration 008 —
 * hệ không bật cờ này nữa nhưng chịu đựng dữ liệu cũ chưa dọn hết). Slot bận
 * ('occupied'/'maintenance'/'locked') → ném SLOT_BUSY để caller thử ứng viên kế.
 */
export const occupySlotForReservation = async (slotId, transaction) => {
  const slot = await ParkingSlot.findByPk(slotId, { transaction, lock: true });
  if (!slot) throw new AppError('Parking slot not found', 404, 'NOT_FOUND');
  if (!['reserved', 'available'].includes(slot.status)) {
    throw new AppError(`Chỗ đã gán đang bận (hiện tại: ${slot.status})`, 409, 'SLOT_BUSY');
  }
  assertSlotTransition(slot.status, 'occupied');
  await slot.update({ status: 'occupied' }, { transaction });
  return slot;
};
