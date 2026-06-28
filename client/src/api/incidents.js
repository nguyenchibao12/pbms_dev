import api from './axios';

// Sự cố (Incident). Staff báo + xem của mình; Manager/Admin xem tất cả + đổi trạng thái.
// list trả phân trang { items, total, page, limit, pages }; mỗi item có typeLabel/statusLabel sẵn.
export const incidentsApi = {
  list: (params) => api.get('/incidents', { params }),
  create: (data) => api.post('/incidents', data),
  updateStatus: (id, status) => api.patch(`/incidents/${id}/status`, { status }),
};
