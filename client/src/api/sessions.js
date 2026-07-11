import api from './axios';

// Phiên gửi xe — Staff vận hành (check-in / xem phí / xe ra / sửa biển số)
// + User tự xem xe của mình đang trong bãi.
export const sessionsApi = {
  // Danh sách xe đang trong bãi (trả về dạng phân trang: { items, total, page, ... }).
  listActive: (params) => api.get('/sessions/active', { params: { limit: 200, ...params } }),
  // User — xe của tôi đang trong bãi (kèm phí tạm tính, cờ vé tháng, cảnh báo lố giờ).
  mineActive: () => api.get('/sessions/mine/active'),
  // Staff — tra cứu phiên đang đỗ bằng mã QR trên vé (preview trước khi cho xe ra). qrToken ≥ 16 ký tự.
  staffLookup: (qrToken) => api.get('/sessions/staff/lookup', { params: { qrToken } }),
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
  // Tất toán TIỀN MẶT tại booth (cần token Staff): { qrToken | sessionId, gateId?, lostTicket? }
  // Trả về { barrierOpened, fee, method: 'cash', session, payment }
  cashCheckout: (data) => api.post('/sessions/cash-checkout', data),
};
