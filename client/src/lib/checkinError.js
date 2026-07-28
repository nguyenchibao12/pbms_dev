// Đổi lỗi thô của BE ở tab "Check-in (xe vào)" thành câu staff đọc là biết phải sửa gì.
// BE trả { error: { code, message } } — map theo CODE vì code ổn định, còn message có thể đổi chữ.
// Không khớp code nào thì báo chung "Thông tin đặt chỗ không chính xác" theo yêu cầu vận hành.

// Mã quy tắc nội bộ (OR-03, BR-12…) chỉ có nghĩa với người viết tài liệu, staff đọc thấy rối
// → cắt bỏ trước khi hiện. Chỉ cắt khi nằm ở CUỐI câu, tránh xén nhầm nội dung thật.
const RULE_CODE_RE = /\s*\([A-Z]{2,3}-\d+\)\s*$/;

export function stripRuleCode(message) {
  return String(message || '').replace(RULE_CODE_RE, '').trim();
}

/** Lấy message BE đã bỏ mã quy tắc — dùng cho các ô lỗi không cần map chi tiết. */
export function plainApiError(err, fallback = 'Thao tác thất bại, vui lòng thử lại.') {
  return stripRuleCode(err?.response?.data?.error?.message) || fallback;
}

// BE ghép floor_id thô vào câu lỗi sai tầng (vì Floor không có cột `name`), ra chuỗi kiểu
// 'có vé tháng ở tầng "4"' — số 4 đó staff không hiểu. Đọc lại số này rồi tra sang tên tầng
// mà FE đã tải sẵn. BE sau này sửa để trả tên thật thì nhánh dưới vẫn dùng nguyên tên đó.
function floorNameFromMessage(raw, floors) {
  const matched = String(raw || '').match(/tầng\s*"([^"]+)"/i);
  if (!matched) return null;
  const token = matched[1].trim();

  const floor = (floors || []).find(
    (f) => String(f.floor_id) === token || f.floor_code === token || f.label === token,
  );
  if (floor) return floor.label ? `${floor.floor_code} — ${floor.label}` : floor.floor_code;

  // Không tra được: chuỗi thuần số là floor_id trần (vô nghĩa với staff) → bỏ, để câu chung.
  return /^\d+$/.test(token) ? null : token;
}

/**
 * @param err   lỗi axios từ POST /sessions/checkin
 * @param floors danh sách tầng FE đã tải (để dịch floor_id → tên tầng)
 */
export function friendlyCheckinError(err, { floors = [] } = {}) {
  const raw = err?.response?.data?.error?.message || '';
  const code = err?.response?.data?.error?.code || '';
  const clean = stripRuleCode(raw);
  const generic = 'Thông tin đặt chỗ không chính xác.';

  switch (code) {
    // ── Vé tháng ──────────────────────────────────────────────────────────────
    case 'PASS_WRONG_FLOOR': {
      const floorName = floorNameFromMessage(raw, floors);
      return floorName
        ? `Vé tháng bị sai tầng, tầng đúng là "${floorName}"`
        : 'Vé tháng bị sai tầng — chọn đúng tầng ghi trên vé.';
    }
    case 'PASS_VEHICLE_MISMATCH':
      return 'Vé tháng bị sai loại xe — chọn đúng loại xe ghi trên vé.';
    case 'PASS_OUTSIDE_WINDOW':
      return 'Vé tháng đang ngoài khung giờ hiệu lực — xe vào lúc này sẽ tính phí như khách vãng lai.';

    // ── Hết chỗ ───────────────────────────────────────────────────────────────
    case 'PASS_CAPACITY_RESERVED':
      return 'Hết chỗ cho khách vãng lai — số chỗ trống còn lại đang để dành cho vé tháng.';
    case 'WALKIN_HELD_FOR_RESERVATIONS':
      return 'Hết chỗ cho khách vãng lai — số chỗ trống còn lại đang giữ cho các đơn đặt sắp tới.';

    // ── Đặt chỗ ───────────────────────────────────────────────────────────────
    case 'RESERVATION_WRONG_FLOOR':
      return 'Xe này có đơn đặt chỗ ở tầng khác — chọn đúng tầng của đơn, hoặc dùng tab "Đặt chỗ vào".';
    case 'RESERVATION_VEHICLE_MISMATCH':
      return 'Xe này có đơn đặt chỗ với loại xe khác — chọn đúng loại xe, hoặc dùng tab "Đặt chỗ vào".';
    case 'RESERVATION_NOT_OPEN':
      return clean || 'Chưa tới giờ vào của đơn đặt chỗ — dùng tab "Đặt chỗ vào" (sớm nhất 15 phút trước giờ đặt).';

    // ── Còn lại ───────────────────────────────────────────────────────────────
    case 'CONFLICT':
      return /active session/i.test(raw)
        ? 'Xe này đang có phiên trong bãi — phải cho xe ra trước khi check-in lượt mới.'
        : clean || generic;
    case 'VALIDATION_ERROR':
      // Lỗi định dạng biển số của BE đã đủ rõ, giữ nguyên.
      return clean || generic;
    default:
      return clean || generic;
  }
}
