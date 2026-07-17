export const parseTimeToMinutes = (timeVal) => {
  if (!timeVal) return 0;
  const str = typeof timeVal === 'string' ? timeVal : String(timeVal);
  const parts = str.split(':');
  const h = Number(parts[0]) || 0;
  const m = Number(parts[1]) || 0;
  return h * 60 + m;
};

/**
 * Vé có hiệu lực tại thời điểm này không — kiểm 2 lớp: KHOẢNG NGÀY (start_date..end_date) và
 * KHUNG GIỜ trong ngày (valid_from_time..valid_to_time, snapshot giờ mở cửa tòa lúc mua).
 */
export const isWithinPassWindow = (pass, dateTime) => {
  if (!pass || pass.status !== 'active') return false;   // pending/cancelled/expired đều không dùng được

  const d = new Date(dateTime);
  const start = new Date(pass.start_date);
  start.setHours(0, 0, 0, 0);                         // nới ra cả ngày: vé ngày đầu vào từ 00:00
  const end = new Date(pass.end_date);
  end.setHours(23, 59, 59, 999);                      // ...và ngày cuối dùng hết đêm, không cắt lúc 00:00

  if (d < start || d > end) return false;

  const minutes = d.getHours() * 60 + d.getMinutes();
  const from = parseTimeToMinutes(pass.valid_from_time);
  const to = parseTimeToMinutes(pass.valid_to_time);
  // Khung qua nửa đêm (from > to, vd 22:00→06:00): hợp lệ nếu sau 'from' HOẶC trước 'to'
  if (from > to) return minutes >= from || minutes <= to;
  return minutes >= from && minutes <= to;
};

// Miễn phí chỉ khi CẢ vào lẫn ra đều trong khung. Vào đúng khung rồi đỗ lố ra ngoài khung là
// phải trả tiền — không thì quét vào lúc 21:59 rồi để xe cả tuần vẫn free.
export const isSessionFreeUnderPass = (pass, timeIn, timeOut) =>
  isWithinPassWindow(pass, timeIn) && isWithinPassWindow(pass, timeOut);

export const normalizeTimeInput = (value) => {
  if (!value) return null;
  if (/^\d{2}:\d{2}$/.test(value)) return `${value}:00`;
  return value;
};
