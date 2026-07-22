import { Gate, Floor } from '../models/index.js';
import { AppError } from '../utils/helpers.js';
import { buildGateCode } from '../utils/gateCode.js';

const gateIncludes = [
  { association: 'floor', attributes: ['floor_id', 'floor_code', 'label'] },
];

export const listGates = async (floorId) => {
  const where = floorId ? { floor_id: floorId } : {};
  return Gate.findAll({ where, include: gateIncludes, order: [['gate_code', 'ASC']] });
};

// Kiosk: danh sách cổng tối giản cho dropdown (không cần đăng nhập, xác thực bằng kiosk-key).
// Chỉ trả các cột vô hại để màn hình cổng tự chọn vị trí đang đứng.
export const listGatesForKiosk = async () =>
  Gate.findAll({
    attributes: ['gate_id', 'gate_code', 'label', 'direction', 'floor_id'],
    include: [{ association: 'floor', attributes: ['floor_code'] }],
    order: [['floor_id', 'ASC'], ['direction', 'ASC']],
  });

export const getGate = async (id) => {
  const gate = await Gate.findByPk(id, { include: gateIncludes });
  if (!gate) throw new AppError('Gate not found', 404, 'NOT_FOUND');
  return gate;
};

// Mỗi phạm vi (1 tầng, hoặc cấp tòa nhà = floor_id NULL) chỉ được 1 cổng IN + 1 cổng OUT:
// gateScan suy "xe đang ở đâu" từ cổng vừa quét, 2 cổng OUT cùng tầng thì câu đó có 2 đáp án.
// Đây cũng là lý do mã cổng tự sinh được TRỌN VẸN từ (tầng, hướng) — không cần số thứ tự.
const assertSingleDirectionGate = async (floorId, direction, excludeGateId = null) => {
  if (!direction) return;
  const existing = await Gate.findOne({ where: { floor_id: floorId, direction } });
  if (existing && existing.gate_id !== excludeGateId) {
    const scope = floorId == null ? 'tòa nhà' : `tầng (floorId=${floorId})`;
    throw new AppError(
      `Mỗi ${scope} chỉ được 1 cổng ${direction.toUpperCase()} (đã có cổng "${existing.gate_code}")`,
      409,
      'CONFLICT',
    );
  }
};

export const createGate = async (data) => {
  const floorId = data.floorId ?? null; // NULL = cổng cấp tòa nhà
  let floor = null;
  if (floorId != null) {
    floor = await Floor.findByPk(floorId);
    if (!floor) throw new AppError('Floor not found', 404, 'NOT_FOUND');
  }

  await assertSingleDirectionGate(floorId, data.direction, null);

  // Mã cổng do hệ thống sinh theo <TẦNG>-<IN|OUT> (BLD-IN/OUT cho cấp tòa) — không nhập tay.
  const gateCode = buildGateCode(floor, data.direction);

  return Gate.create({
    floor_id: floorId,
    gate_code: gateCode,
    direction: data.direction,
    label: data.label ?? null,
    is_active: data.isActive ?? true,
  });
};

export const updateGate = async (id, data) => {
  const gate = await Gate.findByPk(id);
  if (!gate) throw new AppError('Gate not found', 404, 'NOT_FOUND');

  const newFloorId = data.floorId !== undefined ? data.floorId : gate.floor_id;
  let newFloor = null;
  if (newFloorId != null) {
    newFloor = await Floor.findByPk(newFloorId);
    if (!newFloor) throw new AppError('Floor not found', 404, 'NOT_FOUND');
  }

  const newDirection = data.direction ?? gate.direction;
  if (newDirection !== gate.direction || newFloorId !== gate.floor_id) {
    await assertSingleDirectionGate(newFloorId, newDirection, gate.gate_id);
  }

  // Mã cổng là tự sinh theo (tầng, hướng) → đổi tầng/hướng thì sinh lại cho khớp (bỏ qua nếu client gửi).
  const gateCode = buildGateCode(newFloor, newDirection);

  await gate.update({
    floor_id: newFloorId,
    gate_code: gateCode,
    direction: newDirection,
    label: data.label !== undefined ? data.label : gate.label,
    is_active: data.isActive ?? gate.is_active,
  });
  return gate;
};

export const deleteGate = async (id) => {
  const gate = await Gate.findByPk(id);
  if (!gate) throw new AppError('Gate not found', 404, 'NOT_FOUND');
  await gate.destroy();
};
