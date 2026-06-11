import axios from 'axios';

// Instance dùng chung cho toàn bộ lời gọi API.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  headers: { 'Content-Type': 'application/json' },
});

// Handler gọi khi gặp 401 — AuthContext sẽ đăng ký để điều hướng về /login.
let onUnauthorized = null;

export const setOnUnauthorized = (handler) => {
  onUnauthorized = handler;
};

// Request: tự gắn token (nếu có) vào header Authorization.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  } else {
    delete config.headers.Authorization;
  }
  return config;
});

// Response: token hết hạn/không hợp lệ -> xóa token + báo cho app.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      onUnauthorized?.();
    }
    return Promise.reject(error);
  },
);

export default api;
