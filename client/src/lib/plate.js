/**
 * Validate & chuẩn hóa biển số xe Việt Nam — bản FE, mirror server/src/utils/plateVN.js
 * (Thông tư 79/2024/TT-BCA, hiệu lực 01/01/2025 + các định dạng cũ còn lưu hành).
 *
 * Mục đích: chặn NGAY tại ô nhập thay vì để khách bấm gửi rồi mới nhận lỗi từ BE.
 * BE vẫn là nguồn chân lý — sửa PATTERNS bên server thì đồng bộ file này.
 */

// Seri cá nhân: không dùng I, J, O, Q, W (R dành cho rơ moóc).
const L = '[A-HK-NP-TV-Z]';
const L2 = '[A-HK-NP-TV-Z]{2}';

const PATTERNS = [
  {
    // Ô tô / xe máy (2025): 30AB-123.45
    re: new RegExp(`^(\\d{2})(${L2})[-.]?(\\d{3})\\.?(\\d{2})$`),
    normalize: ([, prov, series, a, b]) => `${prov}${series}-${a}.${b}`,
  },
  {
    // Ô tô có dấu chấm: 51F-123.45
    re: new RegExp(`^(\\d{2})(${L})[-.]?(\\d{3})\\.(\\d{2})$`),
    normalize: ([, prov, series, a, b]) => `${prov}${series}-${a}.${b}`,
  },
  {
    // 5 số liền → chuẩn hóa dấu chấm: 30A-12345 → 30A-123.45
    re: new RegExp(`^(\\d{2})(${L})[-.]?(\\d{5})$`),
    normalize: ([, prov, series, num]) => `${prov}${series}-${num.slice(0, 3)}.${num.slice(3)}`,
  },
  {
    // 4 số (biển cũ): 29A-1234
    re: new RegExp(`^(\\d{2})(${L})[-.]?(\\d{4})$`),
    normalize: ([, prov, series, num]) => `${prov}${series}-${num}`,
  },
  {
    // Xe máy seri chữ + số: 59-F1/345.67
    re: new RegExp(`^(\\d{2})[-]?(${L})(\\d)[/.-]?(\\d{3})\\.?(\\d{2})$`),
    normalize: ([, prov, series, digit, a, b]) => `${prov}${series}${digit}-${a}.${b}`,
  },
  {
    // Xe máy seri chữ + số, 4 SỐ (biển cũ): 82-H3 9423 → 82H3-9423
    re: new RegExp(`^(\\d{2})[-]?(${L})(\\d)[/.-]?(\\d{4})$`),
    normalize: ([, prov, series, digit, num]) => `${prov}${series}${digit}-${num}`,
  },
];

export const PLATE_VN_HINT =
  'VD: 30A-123.45 (ô tô), 30AB-123.45 (biển 2025), 51F-12345, 59F1-345.67 / 82H3-9423 (xe máy)';

/** Dọn ô nhập: bỏ khoảng trắng, hoa hóa, Đ→D, gạch dài → gạch thường. */
export function cleanPlateInput(input) {
  return String(input || '')
    .trim()
    .toUpperCase()
    .replace(/Đ/g, 'D')
    .replace(/\s+/g, '')
    .replace(/[–—]/g, '-');
}

const isValidProvince = (code) => {
  const n = parseInt(code, 10);
  return n >= 11 && n <= 99;
};

/** { valid, normalized, error } — normalized là dạng chuẩn BE sẽ lưu. */
export function validateAndNormalizePlateVN(input) {
  const s = cleanPlateInput(input);
  if (!s) {
    return { valid: false, normalized: '', error: 'Biển số xe không được để trống' };
  }

  for (const { re, normalize } of PATTERNS) {
    const m = s.match(re);
    if (m) {
      if (!isValidProvince(m[1])) {
        return {
          valid: false,
          normalized: '',
          error: 'Mã tỉnh/thành (2 số đầu) không hợp lệ — phải từ 11 đến 99',
        };
      }
      return { valid: true, normalized: normalize(m), error: null };
    }
  }

  return {
    valid: false,
    normalized: '',
    error: 'Biển số không đúng định dạng VN. VD: 30A-123.45, 30AB-123.45, 51F-12345, 82H3-9423 (xe máy)',
  };
}

/** Chuẩn hóa nếu hợp lệ, còn không thì trả lại nguyên input đã dọn (để không nuốt chữ khách đang gõ). */
export function normalizePlateOrKeep(input) {
  const result = validateAndNormalizePlateVN(input);
  return result.valid ? result.normalized : cleanPlateInput(input);
}
