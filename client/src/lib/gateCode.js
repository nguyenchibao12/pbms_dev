/**
 * Mã cổng (gate_code) — bản FE, chỉ để XEM TRƯỚC. Mã thật do BE sinh khi lưu.
 *
 * Công thức phải khớp TỪNG CHỮ với `server/src/utils/gateCode.js` trên origin/main,
 * lệch một bước là ô preview nói dối Manager:
 *
 *   const dir    = String(direction).toUpperCase();
 *   const prefix = floor ? String(floor.floor_code).toUpperCase() : 'BLD';
 *   return `${prefix}-${dir}`;
 *
 * Tức chỉ đúng 2 bước: viết hoa mã tầng, viết hoa hướng, nối bằng '-'.
 * KHÔNG bỏ dấu, KHÔNG bỏ khoảng trắng, KHÔNG cắt độ dài — mã tầng có gì thì mã cổng mang y nguyên.
 *
 * Mỗi phạm vi (1 tầng, hoặc cấp tòa = floor_id NULL) chỉ được 1 cổng IN + 1 cổng OUT
 * (assertSingleDirectionGate bên BE), nên mã suy trọn vẹn từ (tầng, hướng), không cần số thứ tự.
 */

const BUILDING_PREFIX = 'BLD'; // cổng cấp tòa nhà (floor_id = NULL)

/** Dựng mã cổng từ mã tầng + hướng. Bỏ trống mã tầng = cổng cấp tòa nhà. */
export function buildGateCode({ floorCode, direction }) {
  if (!direction) return '';
  const dir = String(direction).toUpperCase();
  const prefix = floorCode ? String(floorCode).toUpperCase() : BUILDING_PREFIX;
  return `${prefix}-${dir}`;
}

/**
 * Tìm cổng đang chiếm mã này. Kiểm TOÀN hệ thống chứ không chỉ trong cùng tầng:
 * dropdown cổng của Staff chỉ hiện mã (không hiện tầng) nên 2 tầng trùng mã là bẫy nhầm lẫn.
 * excludeGateId để khi sửa cổng thì không tự báo trùng với chính nó.
 *
 * So khớp NGUYÊN chuỗi (bỏ qua hoa/thường, đúng collation của MySQL) chứ không bỏ dấu gạch:
 * mã tầng được phép chứa '-' nên "B-1" và "B1" là hai tầng khác nhau, gộp dấu lại là báo trùng oan.
 */
export function findGateCodeConflict(code, gates, excludeGateId = null) {
  const target = String(code || '').trim().toUpperCase();
  if (!target) return null;
  return (
    gates.find(
      (g) =>
        String(g.gate_id) !== String(excludeGateId) &&
        String(g.gate_code || '').trim().toUpperCase() === target,
    ) || null
  );
}

const scopeLabel = (gate, floors) => {
  if (gate.floor_id == null) return 'cấp tòa nhà';
  const floor = floors.find((f) => String(f.floor_id) === String(gate.floor_id));
  return `tầng ${floor?.label || floor?.floor_code || gate.floor_id}`;
};

const directionLabel = (gate) => (gate.direction === 'out' ? 'ra (OUT)' : 'vào (IN)');

/** Câu báo khi mã đã bị một cổng khác chiếm. */
export function gateTwinMessage(twin, floors = []) {
  return `${scopeLabel(twin, floors)} đã có cổng ${directionLabel(twin)} mã "${twin.gate_code}" — đổi phạm vi hoặc hướng để có mã khác.`;
}
