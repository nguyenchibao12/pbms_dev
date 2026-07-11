import api from './axios';

// Đăng nhập bằng tên đăng nhập + mật khẩu.
export const login = (username, password) =>
  api.post('/auth/login', { username, password });

// Đăng ký tài khoản khách hàng mới.
export const register = (data) => api.post('/auth/register', data);

// Đăng nhập bằng Google: gửi ID token lấy từ nút Google Sign-In, BE tự verify.
// Trả về cùng shape với /auth/login, kèm isNew (true = tài khoản vừa tạo từ Google).
export const googleLogin = (idToken) => api.post('/auth/google', { idToken });

// Lấy thông tin người dùng hiện tại từ token (dùng để khôi phục phiên).
export const getMe = () => api.get('/auth/me');

// Cập nhật hồ sơ của tôi (họ tên, SĐT, tài khoản ngân hàng nhận hoàn tiền).
// Mọi field optional; chỉ gửi field cần đổi. Trả về user đầy đủ như getMe.
export const updateMe = (data) => api.patch('/auth/me', data);

// Gửi lại email xác minh tài khoản (link xác minh trỏ vào trang HTML của BE).
// BE luôn trả message chung, không lộ email có tồn tại hay không.
export const resendVerification = (email) => api.post('/auth/resend-verification', { email });

// Quên mật khẩu: gửi email kèm link đặt lại (BE luôn trả message chung, không lộ email tồn tại hay không).
export const forgotPassword = (email) => api.post('/auth/forgot-password', { email });

// Đặt lại mật khẩu bằng token nhận qua email.
export const resetPassword = (data) => api.post('/auth/reset-password', data);
