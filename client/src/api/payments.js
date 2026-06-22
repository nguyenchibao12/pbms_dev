import api from './axios';

// Thanh toán — xác minh sau khi PayOS redirect về.
// Localhost không nhận được webhook PayOS, nên client chủ động gửi orderCode lên;
// server hỏi PayOS trạng thái thật, nếu PAID thì xác nhận đơn (idempotent).
export const paymentsApi = {
  // Trả về { paid, status?, type?, reservation?, payment? } trong res.data.data
  verify: (orderCode) => api.get('/payments/verify', { params: { orderCode } }),
};
