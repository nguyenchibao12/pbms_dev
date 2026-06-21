import api from './axios';

// Phiên gửi xe — Staff vận hành (check-in / xem phí / xe ra / sửa biển số).
export const sessionsApi = {
  // Danh sách xe đang trong bãi (trả về dạng phân trang: { items, total, page, ... }).
  listActive: (params) => api.get('/sessions/active', { params: { limit: 200, ...params } }),
  get: (id) => api.get(`/sessions/${id}`),
  // Check-in xe vào: { plateNumber, vehicleTypeId, floorId, gateId, zoneId? }
  checkin: (data) => api.post('/sessions/checkin', data),
  // Xem trước phí: cần 1 trong { sessionId | plateNumber | qrToken }, kèm lostTicket?
  previewFee: (data) => api.post('/sessions/preview-fee', data),
  // Xe ra (check-out): { sessionId | plateNumber, gateId (cổng OUT), lostTicket? }
  // Trả về { fee, barrierOpened, freeCheckout?, passCovered?, payment? }
  checkout: (data) => api.post('/sessions/checkout', data),
  // Sửa biển số phiên đang mở
  correctPlate: (id, plateNumber) => api.patch(`/sessions/${id}/plate`, { plateNumber }),
};
