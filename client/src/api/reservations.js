import api from './axios';

// Reservation — phía khách hàng (User). KHÔNG gồm các hàm staff check-in.
// Tất cả endpoint yêu cầu đăng nhập role 'User' (token tự gắn qua api/axios.js).
export const reservationsApi = {
  // Đặt chỗ + tạo link thanh toán PayOS.
  // body: { plateNumber, vehicleTypeId, floorId, shiftId, arrivalDate, zoneId? }
  create: (data) => api.post('/reservations', data),

  // Danh sách đặt chỗ của tôi.
  listMine: () => api.get('/reservations/mine'),

  // Chi tiết 1 đơn.
  get: (id) => api.get(`/reservations/${id}`),

  // Hủy đơn (pending/confirmed) + hoàn phí theo chính sách.
  cancel: (id) => api.post(`/reservations/${id}/cancel`),

  // Preview: đếm chỗ trống trong khung giờ (trước khi đặt). Tham số là query.
  // params: { floorId, vehicleTypeId, shiftId, arrivalDate, zoneId? }
  windowAvailability: (params) => api.get('/reservations/window-availability', { params }),

  // Preview: gợi ý chỗ tốt nhất (tùy chọn, có thể bỏ qua ở bản đầu).
  suggestSlot: (params) => api.get('/reservations/suggest-slot', { params }),
};
