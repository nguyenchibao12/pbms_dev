/**
 * DV-01 — Validate & normalize biển số xe Việt Nam
 * Tham chiếu: Thông tư 79/2024/TT-BCA (hiệu lực 01/01/2025), QCVN 08:2024/BCA
 * Hỗ trợ cả định dạng cũ còn lưu hành.
 */

// Seri hợp lệ: A–Z trừ I, J, O, Q, R, W (R dành rơ-moóc, không nhận ở bãi này).
// Tập cho phép: A B C D E F G H K L M N P S T U V X Y Z (20 chữ).
const L = '[A-HK-NPS-VX-Z]'; // A-H, K-N, P, S-V, X-Z
const L2 = '[A-HK-NPS-VX-Z]{2}';

// category: phân loại theo SERI để cross-check với loại xe đã chọn.
//   'car'       — seri TOÀN CHỮ (51F, 30A) → ô tô
//   'motorbike' — seri CHỮ+SỐ (59F1, 82H3) → xe máy
//   'either'    — seri 2 CHỮ đời 2025 (30AB) → luật dùng CHUNG, không phân biệt được
const PATTERNS = [
  {
    // Ô tô / xe máy (2025): 30AB-123.45 — format dùng chung, không tách được loại xe
    category: 'either',
    re: new RegExp(`^(\\d{2})(${L2})[-.]?(\\d{3})\\.?(\\d{2})$`),
    normalize: ([, prov, series, a, b]) => `${prov}${series}-${a}.${b}`,
  },
  {
    // Ô tô có dấu chấm: 51F-123.45
    category: 'car',
    re: new RegExp(`^(\\d{2})(${L})[-.]?(\\d{3})\\.(\\d{2})$`),
    normalize: ([, prov, series, a, b]) => `${prov}${series}-${a}.${b}`,
  },
  {
    // 5 số liền → chuẩn hóa dấu chấm: 30A-12345 → 30A-123.45
    category: 'car',
    re: new RegExp(`^(\\d{2})(${L})[-.]?(\\d{5})$`),
    normalize: ([, prov, series, num]) => `${prov}${series}-${num.slice(0, 3)}.${num.slice(3)}`,
  },
  {
    // 4 số (biển cũ): 29A-1234
    category: 'car',
    re: new RegExp(`^(\\d{2})(${L})[-.]?(\\d{4})$`),
    normalize: ([, prov, series, num]) => `${prov}${series}-${num}`,
  },
  {
    // Xe máy seri chữ + số: 59-F1/345.67
    category: 'motorbike',
    re: new RegExp(`^(\\d{2})[-]?(${L})(\\d)[/.-]?(\\d{3})\\.?(\\d{2})$`),
    normalize: ([, prov, series, digit, a, b]) => `${prov}${series}${digit}-${a}.${b}`,
  },
  {
    // Xe máy seri chữ + số, 4 SỐ (biển cũ): 82-H3 9423 -> 82H3-9423
    // Trước đây lọt khe: pattern "seri chữ+số" ở trên bắt buộc 5 số, còn pattern "4 số" bên trên
    // lại chỉ nhận seri TOÀN CHỮ (29A-1234) → biển xe máy đời cũ (seri chữ+số + 4 số) bị từ chối.
    category: 'motorbike',
    re: new RegExp(`^(\\d{2})[-]?(${L})(\\d)[/.-]?(\\d{4})$`),
    normalize: ([, prov, series, digit, num]) => `${prov}${series}${digit}-${num}`,
  },
];

export const PLATE_VN_HINT =
  'Định dạng VN: 30A-123.45 (ô tô), 30AB-123.45 (2025), 51F-12345, 59F1-345.67 / 82H3-9423 (xe máy)';

export function cleanPlateInput(input) {
  return String(input || '')
    .trim()
    .toUpperCase()
    .replace(/Đ/g, 'D')
    .replace(/\s+/g, '')
    .replace(/[–—]/g, '-');
}

function isValidProvince(code) {
  const n = parseInt(code, 10);
  return n >= 11 && n <= 99;
}

export function validateAndNormalizePlateVN(input) {
  const s = cleanPlateInput(input);
  if (!s) {
    return { valid: false, normalized: '', category: null, error: 'Biển số xe không được để trống' };
  }

  for (const { re, normalize, category } of PATTERNS) {
    const m = s.match(re);
    if (m) {
      if (!isValidProvince(m[1])) {
        return {
          valid: false,
          normalized: '',
          category: null,
          error: 'Mã tỉnh/thành (2 số đầu) không hợp lệ — phải từ 11 đến 99',
        };
      }
      return { valid: true, normalized: normalize(m), category, error: null };
    }
  }

  return {
    valid: false,
    normalized: '',
    category: null,
    error: 'Biển số không đúng định dạng VN. VD: 30A-123.45, 30AB-123.45, 51F-12345, 82H3-9423 (xe máy)',
  };
}

export function normalizePlateVN(input) {
  const result = validateAndNormalizePlateVN(input);
  if (!result.valid) {
    throw new Error(result.error);
  }
  return result.normalized;
}

// type_code loại xe được coi là XE MÁY. Mọi loại khác (CAR, CAR7...) coi là ô tô.
// Thêm loại xe máy mới thì bổ sung vào đây (hoặc chuyển sang cột category trên VehicleType).
export const MOTORBIKE_TYPE_CODES = ['BIKE'];

/**
 * Biển (theo category từ validateAndNormalizePlateVN) có khớp loại xe đã chọn không.
 * - 'either' (biển 2 chữ 2025): luôn khớp — luật dùng chung, không tách được.
 * - còn lại: 'motorbike' khớp type_code xe máy; 'car' khớp các type_code còn lại.
 * category null/không xác định → coi như khớp (để tầng validate định dạng lo, không chặn nhầm).
 */
export function plateMatchesVehicleType(category, typeCode) {
  if (!category || category === 'either') return true;
  const expected = MOTORBIKE_TYPE_CODES.includes(typeCode) ? 'motorbike' : 'car';
  return category === expected;
}
