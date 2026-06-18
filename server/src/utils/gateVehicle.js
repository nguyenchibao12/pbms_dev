import { AppError } from './helpers.js';

/** Cổng gắn loại xe — ô tô và xe máy không dùng chung cổng (DV-02 / vận hành) */
export const assertGateVehicleType = (gate, vehicleTypeId, context = 'check-in') => {
  if (!gate) throw new AppError('Gate not found', 404, 'NOT_FOUND');
  if (gate.vehicle_type_id && Number(gate.vehicle_type_id) !== Number(vehicleTypeId)) {
    const gateLabel = gate.label || gate.gate_code;
    throw new AppError(
      `Cổng "${gateLabel}" không phục vụ loại xe này. Chọn đúng cổng theo loại xe.`,
      400,
      'GATE_VEHICLE_MISMATCH',
    );
  }
};

export const gateDisplayLabel = (gate) => {
  if (!gate) return '—';
  const vt = gate.vehicleType?.type_name || gate.vehicleType?.type_code;
  const base = gate.label || gate.gate_code;
  return vt ? `${base} · ${vt}` : base;
};
