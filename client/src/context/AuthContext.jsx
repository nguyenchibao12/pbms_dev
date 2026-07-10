import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { getMe, login as loginApi, register as registerApi, googleLogin as googleLoginApi } from '../api/auth';
import { setOnUnauthorized } from '../api/axios';
import { toast } from '../components/ui/toast';

const AuthContext = createContext(null);

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // tự đăng xuất sau 30 phút không hoạt động
const CHECK_INTERVAL_MS = 30 * 1000; // kiểm tra mỗi 30 giây
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];

/** Lấy thời điểm hết hạn (ms) từ JWT, null nếu không đọc được. */
function getTokenExpMs(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload?.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const lastActivityRef = useRef(0);

  const clearSession = useCallback(() => {
    localStorage.removeItem('token');
    setUser(null);
  }, []);

  // Khôi phục phiên từ token đã lưu khi tải lại trang.
  const loadUser = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await getMe();
      setUser(data.data);
    } catch {
      clearSession();
    } finally {
      setLoading(false);
    }
  }, [clearSession]);

  useEffect(() => {
    // Khôi phục phiên một lần khi mount; loadUser tự quản lý cờ loading.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadUser();
  }, [loadUser]);

  // Đăng ký handler cho axios: gặp 401 thì xóa phiên ngay.
  useEffect(() => {
    setOnUnauthorized(() => clearSession());
  }, [clearSession]);

  // Tự đăng xuất khi JWT hết hạn hoặc người dùng không hoạt động quá lâu.
  useEffect(() => {
    if (!user) return undefined;
    lastActivityRef.current = Date.now();
    const onActivity = () => {
      lastActivityRef.current = Date.now();
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    const interval = setInterval(() => {
      const token = localStorage.getItem('token');
      const expMs = token ? getTokenExpMs(token) : null;
      if (!token || (expMs && Date.now() >= expMs)) {
        clearSession();
        toast.info('Phiên đăng nhập đã hết hạn — vui lòng đăng nhập lại.');
        return;
      }
      if (Date.now() - lastActivityRef.current >= IDLE_TIMEOUT_MS) {
        clearSession();
        toast.info('Tự đăng xuất do không hoạt động — vui lòng đăng nhập lại.');
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      clearInterval(interval);
    };
  }, [user, clearSession]);

  const login = async (username, password) => {
    clearSession();
    const { data } = await loginApi(username, password);
    localStorage.setItem('token', data.data.token);
    setUser(data.data.user);
    return data.data;
  };

  // Đăng nhập Google: BE verify idToken rồi trả JWT PBMS y như login thường.
  // data.data = { user, token, isNew } — isNew = tài khoản vừa được tạo từ Google.
  const loginWithGoogle = async (idToken) => {
    clearSession();
    const { data } = await googleLoginApi(idToken);
    localStorage.setItem('token', data.data.token);
    setUser(data.data.user);
    return data.data;
  };

  const register = async (payload) => {
    clearSession();
    const { data } = await registerApi(payload);
    localStorage.setItem('token', data.data.token);
    setUser(data.data.user);
    return data.data;
  };

  const logout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  // Cập nhật user trong context sau khi PATCH /auth/me (nhận lại user đầy đủ từ BE).
  const updateUser = useCallback((nextUser) => setUser(nextUser), []);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, loginWithGoogle, register, logout, updateUser, isAuthenticated: !!user }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
