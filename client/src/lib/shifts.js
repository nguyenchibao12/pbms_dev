// Ca cố định cho đặt chỗ (reservation). Mirror nguồn chân lý ở server
// (server/src/utils/shifts.js) — giữ đồng bộ thủ công. Hệ thống không cho
// nhập giờ tự do; khách chọn ngày + ca, server tự tính khung giờ tuyệt đối.
export const SHIFTS = [
  { id: 'morning', label: 'Ca sáng', start: '06:00', end: '12:00', overnight: false },
  { id: 'afternoon', label: 'Ca chiều', start: '12:00', end: '18:00', overnight: false },
  { id: 'evening', label: 'Ca tối', start: '18:00', end: '22:00', overnight: false },
  { id: 'overnight', label: 'Ca qua đêm', start: '22:00', end: '06:00', overnight: true },
];

export const getShift = (shiftId) => SHIFTS.find((s) => s.id === shiftId) || null;

const parseHm = (value) => {
  const [h, m] = String(value).split(':').map(Number);
  return { h: h || 0, m: m || 0 };
};

/**
 * Tính mốc bắt đầu/kết thúc (Date local) từ ngày + ca — dùng để chặn "ca đã qua"
 * và hiển thị khung giờ. Ca qua đêm kết thúc vào sáng hôm sau.
 * @param {string} dateStr 'YYYY-MM-DD'
 * @param {string} shiftId
 * @returns {{ start: Date, end: Date, shift: object } | null}
 */
export const resolveShiftWindow = (dateStr, shiftId) => {
  const shift = getShift(shiftId);
  if (!shift || !dateStr) return null;
  const [y, mo, d] = String(dateStr).split('-').map(Number);
  if (!y || !mo || !d) return null;

  const s = parseHm(shift.start);
  const e = parseHm(shift.end);
  const start = new Date(y, mo - 1, d, s.h, s.m, 0, 0);
  const end = new Date(y, mo - 1, d, e.h, e.m, 0, 0);
  if (shift.overnight || end <= start) {
    end.setDate(end.getDate() + 1);
  }
  return { start, end, shift };
};

/** Nhãn khung giờ gọn cho hiển thị, vd "Ca sáng · 06:00–12:00". */
export const formatShiftLabel = (shiftId) => {
  const shift = getShift(shiftId);
  if (!shift) return '';
  return `${shift.label} · ${shift.start}–${shift.end}`;
};
