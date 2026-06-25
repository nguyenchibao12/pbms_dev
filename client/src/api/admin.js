import api from './axios';

// Khu vực Quản trị (Admin-only) — backend tự kiểm role qua middleware.
export const auditApi = {
  // Nhật ký thao tác Admin/Manager — lọc (actorId, action, from, to) + phân trang (page, limit).
  // Trả { success, data: { items, total, page, limit, pages } }.
  list: (params) => api.get('/admin/audit-logs', { params }),
};
