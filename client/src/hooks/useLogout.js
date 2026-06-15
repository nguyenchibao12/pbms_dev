import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/** Đăng xuất rồi về trang login — xóa state điều hướng cũ để tránh dính URL vai trò trước. */
export function useLogout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  return () => {
    logout();
    navigate('/login', { replace: true, state: {} });
  };
}
