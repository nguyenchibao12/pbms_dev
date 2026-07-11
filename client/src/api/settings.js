import api from './axios';

// Cấu hình hệ thống — chỉ Manager/Admin đọc/ghi (BE tự kiểm quyền, trả 403 nếu sai).
// GET trả full cấu hình; PATCH nhận PARTIAL (chỉ field đổi) và trả lại full sau cập nhật.
export const systemSettingsApi = {
  get: () => api.get('/settings/system'),
  update: (data) => api.patch('/settings/system', data),
};
