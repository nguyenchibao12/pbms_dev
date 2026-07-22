// Cổng KHÔNG còn gắn loại xe (mỗi tầng/tòa chỉ 1 cổng IN + 1 OUT dùng chung mọi loại xe).
// Giữ lại helper hiển thị nhãn cổng cho đồng nhất chỗ gọi.
export const gateDisplayLabel = (gate) => {
  if (!gate) return '—';
  return gate.label || gate.gate_code;
};
