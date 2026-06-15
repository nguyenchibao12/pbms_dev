import api from './axios';

export const floorsApi = {
  list: () => api.get('/floors'),
  get: (id) => api.get(`/floors/${id}`),
  create: (data) => api.post('/floors', data),
  update: (id, data) => api.put(`/floors/${id}`, data),
  remove: (id) => api.delete(`/floors/${id}`),
};

export const zonesApi = {
  list: (floorId) => api.get('/zones', { params: floorId ? { floorId } : {} }),
  get: (id) => api.get(`/zones/${id}`),
  create: (data) => api.post('/zones', data),
  update: (id, data) => api.put(`/zones/${id}`, data),
  remove: (id) => api.delete(`/zones/${id}`),
};

// CRUD loại xe (Car / Motorbike / SUV...). Đọc cho mọi vai trò đã đăng nhập,
// ghi (create/update/remove) chỉ Manager — backend tự kiểm tra quyền.
export const vehicleTypesApi = {
  list: () => api.get('/vehicle-types'),
  get: (id) => api.get(`/vehicle-types/${id}`),
  create: (data) => api.post('/vehicle-types', data),
  update: (id, data) => api.put(`/vehicle-types/${id}`, data),
  remove: (id) => api.delete(`/vehicle-types/${id}`),
};

// CRUD bảng giá theo loại xe. Phí = CEIL(thời gian / đơn vị) × đơn giá.
// Đọc cho mọi vai trò đã đăng nhập, ghi chỉ Manager.
export const pricingRulesApi = {
  list: (vehicleTypeId) =>
    api.get('/pricing-rules', { params: vehicleTypeId ? { vehicleTypeId } : {} }),
  get: (id) => api.get(`/pricing-rules/${id}`),
  create: (data) => api.post('/pricing-rules', data),
  update: (id, data) => api.put(`/pricing-rules/${id}`, data),
  remove: (id) => api.delete(`/pricing-rules/${id}`),
};
