import api from './axios';

// CRUD tầng/tầng hầm (mã tầng, cấp, nhãn). Nền cho khu (zone) và chỗ đỗ.
// Đọc cho mọi vai trò đã đăng nhập, ghi chỉ Manager.
export const floorsApi = {
  list: () => api.get('/floors'),
  get: (id) => api.get(`/floors/${id}`),
  create: (data) => api.post('/floors', data),
  update: (id, data) => api.put(`/floors/${id}`, data),
  remove: (id) => api.delete(`/floors/${id}`),
};

// CRUD khu vực (zone) trong từng tầng. Đọc cho mọi vai trò đã đăng nhập, ghi chỉ Manager.
export const zonesApi = {
  list: (floorId) => api.get('/zones', { params: floorId ? { floorId } : {} }),
  get: (id) => api.get(`/zones/${id}`),
  create: (data) => api.post('/zones', data),
  update: (id, data) => api.put(`/zones/${id}`, data),
  remove: (id) => api.delete(`/zones/${id}`),
};

// CRUD chỗ đỗ (parking_slot) trong từng khu (zone). Lọc list theo zoneId.
// Đổi trạng thái slot thực hiện qua update (PUT) với field `status`.
// Đọc cho mọi vai trò đã đăng nhập, ghi chỉ Manager.
export const parkingSlotsApi = {
  list: (zoneId) => api.get('/parking-slots', { params: zoneId ? { zoneId } : {} }),
  get: (id) => api.get(`/parking-slots/${id}`),
  create: (data) => api.post('/parking-slots', data),
  update: (id, data) => api.put(`/parking-slots/${id}`, data),
  remove: (id) => api.delete(`/parking-slots/${id}`),
};

// CRUD cổng (gate) ra/vào theo tầng. Lọc list theo floorId.
// Mỗi cổng nên gắn loại xe để validate khi staff check-in. Ghi chỉ Manager.
export const gatesApi = {
  list: (floorId) => api.get('/gates', { params: floorId ? { floorId } : {} }),
  get: (id) => api.get(`/gates/${id}`),
  create: (data) => api.post('/gates', data),
  update: (id, data) => api.put(`/gates/${id}`, data),
  remove: (id) => api.delete(`/gates/${id}`),
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
