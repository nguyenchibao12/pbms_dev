import api from './axios';

// CRUD loại xe (Car / Motorbike / SUV...). Đọc cho mọi vai trò đã đăng nhập,
// ghi (create/update/remove) chỉ Manager — backend tự kiểm tra quyền.
export const vehicleTypesApi = {
  list: () => api.get('/vehicle-types'),
  get: (id) => api.get(`/vehicle-types/${id}`),
  create: (data) => api.post('/vehicle-types', data),
  update: (id, data) => api.put(`/vehicle-types/${id}`, data),
  remove: (id) => api.delete(`/vehicle-types/${id}`),
};
