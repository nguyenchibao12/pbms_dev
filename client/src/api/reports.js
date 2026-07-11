import api from './axios';

// Báo cáo (Manager-only, BE tự kiểm quyền qua managerOnly, trả 403 nếu sai vai trò).
// - occupancy: tỷ lệ lấp đầy HIỆN TẠI (snapshot + theo tầng). floorId tùy chọn.
// - overview: doanh thu + lưu lượng vào/ra theo KHOẢNG NGÀY, kèm luôn occupancy hiện tại.
//   from/to bắt buộc (ISO8601), floorId tùy chọn.
export const reportsApi = {
  occupancy: (floorId) => api.get('/reports/occupancy', { params: floorId ? { floorId } : {} }),
  overview: ({ from, to, floorId } = {}) =>
    api.get('/reports/overview', { params: { from, to, ...(floorId ? { floorId } : {}) } }),
};
