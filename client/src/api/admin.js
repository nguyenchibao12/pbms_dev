import api from './axios';

// Khu vực Quản trị (Admin-only) — backend tự kiểm role qua middleware.
export const auditApi = {
  // Nhật ký thao tác Admin/Manager — lọc (actorId, action, from, to) + phân trang (page, limit).
  // Trả { success, data: { items, total, page, limit, pages } }.
  list: (params) => api.get('/admin/audit-logs', { params }),
};

// Quản lý tài khoản người dùng (Admin-only). list trả mảng đầy đủ (không phân trang).
export const usersApi = {
  list: () => api.get('/admin/users'),
  listRoles: () => api.get('/admin/users/roles'),
  create: (data) => api.post('/admin/users', data),
  // PATCH: đổi fullName/email/phone/roleId/isActive/password (chỉ gửi field cần đổi).
  update: (id, data) => api.patch(`/admin/users/${id}`, data),
};
