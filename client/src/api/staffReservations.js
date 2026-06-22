import api from './axios';

// Reservation — phía Staff: xem đơn sắp tới, tra cứu QR, cho xe đã đặt chỗ vào bãi.
// (Các hàm phía khách hàng nằm ở api/reservations.js — không trộn vào đây.)
export const staffReservationsApi = {
  // Danh sách đặt chỗ đã thanh toán (confirmed), đang chờ check-in.
  upcoming: () => api.get('/reservations/staff/upcoming'),
  // Tra cứu đặt chỗ bằng mã QR trên vé (preview trước khi cho vào). qrToken ≥ 16 ký tự.
  lookup: (qrToken) => api.get('/reservations/staff/lookup', { params: { qrToken } }),
  // Cho xe đã đặt chỗ vào bãi: { reservationId | qrToken, gateId (cổng IN cùng tầng đã đặt) }
  checkin: (data) => api.post('/reservations/checkin', data),
};
