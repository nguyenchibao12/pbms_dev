export const parseTimeToMinutes = (timeVal) => {
  if (!timeVal) return 0;
  const str = typeof timeVal === 'string' ? timeVal : String(timeVal);
  const parts = str.split(':');
  const h = Number(parts[0]) || 0;
  const m = Number(parts[1]) || 0;
  return h * 60 + m;
};

export const isWithinPassWindow = (pass, dateTime) => {
  if (!pass || pass.status !== 'active') return false;

  const d = new Date(dateTime);
  const start = new Date(pass.start_date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(pass.end_date);
  end.setHours(23, 59, 59, 999);

  if (d < start || d > end) return false;

  const minutes = d.getHours() * 60 + d.getMinutes();
  const from = parseTimeToMinutes(pass.valid_from_time);
  const to = parseTimeToMinutes(pass.valid_to_time);
  // Khung qua nửa đêm (from > to, vd 22:00→06:00): hợp lệ nếu sau 'from' HOẶC trước 'to'
  if (from > to) return minutes >= from || minutes <= to;
  return minutes >= from && minutes <= to;
};

export const isSessionFreeUnderPass = (pass, timeIn, timeOut) =>
  isWithinPassWindow(pass, timeIn) && isWithinPassWindow(pass, timeOut);

export const normalizeTimeInput = (value) => {
  if (!value) return null;
  if (/^\d{2}:\d{2}$/.test(value)) return `${value}:00`;
  return value;
};
