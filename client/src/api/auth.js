import api from './axios';

// Đăng nhập bằng tên đăng nhập + mật khẩu.
export const login = (username, password) =>
  api.post('/auth/login', { username, password });

// Đăng ký tài khoản khách hàng mới.
export const register = (data) => api.post('/auth/register', data);

// Lấy thông tin người dùng hiện tại từ token (dùng để khôi phục phiên).
export const getMe = () => api.get('/auth/me');
