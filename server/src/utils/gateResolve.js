import { Gate } from '../models/index.js';
import { AppError } from './helpers.js';

/**
 * Suy ra cổng cho 1 tầng theo chiều (in/out).
 *
 * - Có `gateId`: nạp + validate (active, đúng chiều, đúng tầng) — như cũ.
 * - Không có `gateId`: tự tìm cổng active duy nhất của tầng theo chiều đó (mỗi tầng
 *   chỉ có 1 cổng IN + 1 cổng OUT nên không cần staff chọn tay).
 *     • 0 cổng  → lỗi NO_GATE_FOR_FLOOR (Manager chưa tạo cổng).
 *     • >1 cổng → lỗi MULTIPLE_GATES (data lỗi, cần chỉ định gateId).
 *
 * `vehicleTypeId` giữ trong chữ ký cho tương thích chỗ gọi nhưng KHÔNG còn dùng — cổng đã bỏ gắn loại xe.
 * Lưu ý: hàm này KHÔNG ghi incident "wrong_floor". Các luồng cần ghi incident khi
 * cổng được chỉ định sai tầng (reservation check-in, check-out) tự xử lý nhánh có
 * gateId, chỉ gọi hàm này cho nhánh auto (gateId rỗng).
 */
export const resolveFloorGate = async ({ floorId, direction, gateId = null, vehicleTypeId = null }) => {
  const dirUpper = direction.toUpperCase();
  const dirLabel = direction === 'in' ? 'vào' : 'ra';

  if (gateId) {
    const gate = await Gate.findByPk(Number(gateId), { include: [{ association: 'floor' }] });
    if (!gate || !gate.is_active) {
      throw new AppError('Gate not found or inactive', 404, 'NOT_FOUND');
    }
    if (gate.direction !== direction) {
      throw new AppError(`Phải dùng cổng ${dirLabel} (${dirUpper})`, 400, 'VALIDATION_ERROR');
    }
    if (floorId != null && gate.floor_id !== floorId) {
      throw new AppError('Gate does not belong to the selected floor', 400, 'VALIDATION_ERROR');
    }
    return gate;
  }

  if (floorId == null) {
    throw new AppError('floorId required to resolve gate', 400, 'VALIDATION_ERROR');
  }

  const candidates = await Gate.findAll({
    where: { floor_id: floorId, direction, is_active: true },
    include: [{ association: 'floor' }],
    order: [['gate_id', 'ASC']],
  });

  if (candidates.length === 0) {
    throw new AppError(
      `Tầng chưa có cổng ${dirLabel} (${dirUpper}) — Manager cần tạo cổng chiều này`,
      400,
      'NO_GATE_FOR_FLOOR',
    );
  }

  // Mỗi tầng chỉ 1 cổng IN + 1 OUT (cổng không còn gắn loại xe) → về lý thuyết luôn còn đúng 1.
  // Vẫn giữ guard MULTIPLE_GATES phòng data lỗi (2 cổng cùng chiều 1 tầng).
  if (candidates.length > 1) {
    throw new AppError(
      `Tầng có nhiều cổng ${dirLabel} — cần chỉ định gateId`,
      409,
      'MULTIPLE_GATES',
    );
  }

  return candidates[0];
};
