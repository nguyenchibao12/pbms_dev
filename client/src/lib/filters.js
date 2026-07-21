// Tiện ích lọc danh sách phía client. Dùng cho các trang gọi endpoint /mine —
// backend trả về NGUYÊN danh sách (không nhận query lọc, không phân trang) nên
// việc lọc nằm hết ở FE; đổi ô lọc là danh sách đổi ngay, không gọi lại API.

// Bỏ mọi ký tự phân cách trong biển số để '51A12345' vẫn khớp '51A-123.45'.
// Khớp cách backend so biển số (REPLACE '-' và '.' rồi LIKE) ở phần tra cứu của Staff.
const compactPlate = (value) => String(value ?? '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();

/** Biển số có chứa chuỗi tìm kiếm không (bỏ qua dấu phân cách và hoa/thường). */
export const matchPlate = (plate, query) => {
  const q = compactPlate(query);
  if (!q) return true;
  return compactPlate(plate).includes(q);
};

// Bỏ dấu tiếng Việt: tách nguyên âm khỏi dấu thanh (NFD) rồi xóa dải dấu tổ hợp
// U+0300–U+036F; riêng 'đ' là một ký tự độc lập nên phải thay tay.
const deaccent = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .trim();

/**
 * Ô tìm kiếm chung cho dữ liệu danh mục: khớp nếu MỘT trong các trường chứa chuỗi tìm.
 * Bỏ dấu nên gõ "tang ham" vẫn ra "Tầng hầm".
 */
export const matchText = (query, ...values) => {
  const q = deaccent(query);
  if (!q) return true;
  return values.some((value) => deaccent(value).includes(q));
};

/**
 * Quy về khóa ngày 'YYYY-MM-DD' để so sánh chuỗi với ô <input type="date">.
 * - DATEONLY ('2026-07-21') giữ nguyên: cắt chuỗi, KHÔNG qua Date() để khỏi lệch múi giờ.
 * - DATETIME ISO: đọc theo giờ địa phương, vì người dùng lọc theo ngày họ nhìn thấy trên màn hình.
 */
export const toDateKey = (value) => {
  if (!value) return '';
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Ngày của `value` có nằm trong [from, to] không (hai đầu đều tính, ô trống = không chặn). */
export const inDateRange = (value, from, to) => {
  if (!from && !to) return true;
  const key = toDateKey(value);
  if (!key) return false;
  if (from && key < from) return false;
  if (to && key > to) return false;
  return true;
};

/**
 * Hai mốc ngày của bản ghi có giao với khoảng [from, to] không — dùng cho vé tháng
 * (lọc "ngày hiệu lực": vé chạy 01/07–31/07 phải hiện khi lọc riêng ngày 15/07).
 */
export const overlapsDateRange = (startValue, endValue, from, to) => {
  if (!from && !to) return true;
  const start = toDateKey(startValue);
  const end = toDateKey(endValue) || start;
  if (!start) return false;
  if (from && end < from) return false;
  if (to && start > to) return false;
  return true;
};

/**
 * Gom danh sách tầng có mặt trong dữ liệu đã tải để đổ vào dropdown lọc.
 * Lấy từ chính bản ghi nên không cần gọi thêm API /floors, và chỉ hiện tầng
 * người dùng thực sự có bản ghi (không bày tầng lọc ra 0 kết quả).
 * `pick` trả về object floor của một bản ghi.
 */
export const collectFloorOptions = (items, pick) => {
  const map = new Map();
  items.forEach((item) => {
    const floor = pick(item);
    const id = floor?.floor_id;
    if (id == null || map.has(id)) return;
    map.set(id, { id, label: floor.label || floor.floor_code || `#${id}` });
  });
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'vi'));
};
