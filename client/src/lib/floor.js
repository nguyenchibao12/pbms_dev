// Nhãn tầng do Manager tự nhập (vd "Tầng 1", "Hầm B1") nên có thể đã chứa sẵn
// chữ "Tầng"/"Hầm". Chỉ thêm tiền tố "Tầng " khi nhãn chưa tự mô tả cấp tầng,
// tránh hiển thị lặp kiểu "Tầng Tầng 1" hay "Tầng Hầm B1".
export const formatFloorLabel = (floor) => {
  const text = String(floor ?? '').trim();
  if (!text) return '';
  return /^(tầng|hầm)\b/i.test(text) ? text : `Tầng ${text}`;
};

/** Bản ghi sức chứa của 1 tầng trong GET /public/availability. */
export const floorMetaIn = (availability, floorId) =>
  (availability || []).find((f) => String(f.floorId) === String(floorId)) || null;

/**
 * Số chỗ { available, total } của tầng, lọc theo loại xe nếu có.
 * total = 0 nghĩa là tầng KHÔNG có khu nào nhận loại xe đó (khác hẳn với "hết chỗ").
 * Trả null khi chưa tải được availability — nơi gọi tự quyết định cho chọn hay không.
 */
export const floorFreeFor = (floorMeta, vehicleTypeId) => {
  if (!floorMeta) return null;
  if (!vehicleTypeId) return { available: floorMeta.available, total: floorMeta.total };
  const zones = (floorMeta.zones || []).filter((z) => String(z.vehicleTypeId) === String(vehicleTypeId));
  return {
    available: zones.reduce((sum, z) => sum + (z.available || 0), 0),
    total: zones.reduce((sum, z) => sum + (z.total || 0), 0),
  };
};

/**
 * Lọc danh sách tầng còn CHỖ CHỨA cho loại xe đang chọn (total > 0) — dùng cho mọi dropdown
 * "chọn tầng" để khách/staff không chọn được tầng chắc chắn không nhận xe của họ.
 * Cố tình KHÔNG lọc theo `available`: chỗ trống thay đổi theo thời điểm, còn sức chứa thì không.
 * Chưa tải được availability thì trả nguyên danh sách, đừng khóa hết dropdown vì một lỗi phụ.
 */
export const floorsAcceptingVehicleType = (floors, availability, vehicleTypeId) => {
  if (!vehicleTypeId || !availability?.length) return floors;
  return floors.filter((f) => {
    const free = floorFreeFor(floorMetaIn(availability, f.floor_id), vehicleTypeId);
    return !free || free.total > 0;
  });
};
