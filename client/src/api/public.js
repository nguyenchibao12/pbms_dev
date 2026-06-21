import api from './axios';

// API công khai cho khách chưa đăng nhập (Guest): bảng giá, chỗ trống, thông tin tòa nhà.
// BE mount tại /api/public — không cần token.
export const publicApi = {
  pricing: () => api.get('/public/pricing'),
  availability: () => api.get('/public/availability'),
  info: () => api.get('/public/info'),
};
