import api from './axios';

// Hoàn tiền hủy vé tháng (P3-8) — Admin-only, BE tự kiểm quyền qua middleware.
// list trả phân trang { items, total, page, limit, pages }; mỗi item kèm user/pass/payment
// + cờ bankInfoReady (user đã có số tài khoản ngân hàng hay chưa).
export const refundApi = {
  list: (params) => api.get('/admin/refunds', { params }),
  // Gửi email nhắc user cập nhật STK (chỉ dùng khi user CHƯA có STK).
  remind: (id) => api.post(`/admin/refunds/${id}/remind`),
  // Đánh dấu đã chuyển khoản hoàn tiền (Admin CK tay xong mới bấm; cần user đã có STK).
  complete: (id, note) => api.post(`/admin/refunds/${id}/complete`, note ? { note } : {}),
};
