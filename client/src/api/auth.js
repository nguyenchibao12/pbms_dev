import api from './axios';

// Đăng nhập bằng tên đăng nhập + mật khẩu.
export const login = (username, password) =>
  api.post('/auth/login', { username, password });

// Đăng ký tài khoản khách hàng mới.
export const register = (data) => api.post('/auth/register', data);

// Lấy thông tin người dùng hiện tại từ token (dùng để khôi phục phiên).
export const getMe = () => api.get('/auth/me');

// Quên mật khẩu: gửi email kèm link đặt lại (BE luôn trả message chung, không lộ email tồn tại hay không).
export const forgotPassword = (email) => api.post('/auth/forgot-password', { email });

// Đặt lại mật khẩu bằng token nhận qua email.
export const resetPassword = (data) => api.post('/auth/reset-password', data);
