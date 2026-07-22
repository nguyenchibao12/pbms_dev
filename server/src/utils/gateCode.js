/**
 * Sinh MÃ CỔNG tự động theo quy ước: <FLOOR_CODE>-<IN|OUT>  (cấp tòa nhà: BLD-IN / BLD-OUT).
 * Mỗi phạm vi (1 tầng, hoặc cấp tòa = floor_id NULL) chỉ được 1 cổng IN + 1 cổng OUT
 * (assertSingleDirectionGate), nên mã suy được TRỌN VẸN từ (tầng, hướng) — không cần số thứ tự,
 * không nhập tay (giảng viên: mã phải tự sinh từ vị trí, không gõ sai lung tung).
 *   - Cổng tầng:  F1-IN, F1-OUT, B1-IN, B1-OUT
 *   - Cổng tòa:   BLD-IN, BLD-OUT
 *
 * @param {object|null} floor - bản ghi Floor (cần floor_code); null = cổng cấp tòa nhà
 * @param {'in'|'out'} direction
 */
export const buildGateCode = (floor, direction) => {
  const dir = String(direction).toUpperCase(); // IN | OUT
  const prefix = floor ? String(floor.floor_code).toUpperCase() : 'BLD';
  return `${prefix}-${dir}`;
};
