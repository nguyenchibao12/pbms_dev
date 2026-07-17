// Nhãn tầng do Manager tự nhập (vd "Tầng 1", "Hầm B1") nên có thể đã chứa sẵn
// chữ "Tầng"/"Hầm". Chỉ thêm tiền tố "Tầng " khi nhãn chưa tự mô tả cấp tầng,
// tránh hiển thị lặp kiểu "Tầng Tầng 1" hay "Tầng Hầm B1".
export const formatFloorLabel = (floor) => {
  const text = String(floor ?? '').trim();
  if (!text) return '';
  return /^(tầng|hầm)\b/i.test(text) ? text : `Tầng ${text}`;
};
