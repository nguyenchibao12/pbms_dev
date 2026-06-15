import { Navigate, Outlet, useLocation, useNavigationType } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getRoleName, getHomePathForRole } from '../lib/auth';

/**
 * Bọc các route cần đăng nhập. Truyền allowedRoles để giới hạn theo vai trò.
 * - Chưa đăng nhập -> chuyển về /login (nhớ URL muốn vào để quay lại sau).
 * - Sai vai trò -> chuyển về trang chính của vai trò hiện tại kèm thông báo.
 */
export default function ProtectedRoute({ allowedRoles }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigationType = useNavigationType();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <p className="text-slate-600">Đang tải...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: location.pathname + location.search,
          message: 'Vui lòng đăng nhập để tiếp tục',
        }}
      />
    );
  }

  if (allowedRoles?.length && !allowedRoles.includes(getRoleName(user))) {
    const home = getHomePathForRole(getRoleName(user));
    const isBackNavigation = navigationType === 'POP';
    return (
      <Navigate
        to={home}
        replace
        state={
          isBackNavigation
            ? {}
            : { flash: 'Bạn không có quyền truy cập trang này — đã chuyển về trang chính.' }
        }
      />
    );
  }

  return <Outlet />;
}
