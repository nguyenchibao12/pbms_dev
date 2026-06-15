/** Chuẩn hóa tên vai trò từ API (camelCase) hoặc bản ghi thô (snake_case). */
export function getRoleName(user) {
  return user?.role?.roleName ?? user?.role?.role_name ?? null;
}

export function isCustomer(user) {
  return getRoleName(user) === 'User';
}

export const roleLabels = {
  Admin: 'Quản trị viên',
  Manager: 'Quản lý',
  Staff: 'Nhân viên',
  User: 'Khách hàng',
};

const pathOnly = (path) => (path || '').split('?')[0];

/** Vai trò có được vào route này không (khớp cấu hình ProtectedRoute trong App.jsx). */
export function canRoleAccessPath(roleName, path) {
  const base = pathOnly(path);
  if (!base || base === '/' || base === '/dashboard' || base === '/unauthorized') return true;
  if (base.startsWith('/admin')) return roleName === 'Admin';
  if (base.startsWith('/manager')) return roleName === 'Manager';
  if (base.startsWith('/staff')) return roleName === 'Staff';
  if (base.startsWith('/reservations') || base.startsWith('/monthly-pass')) return roleName === 'User';
  return true;
}

/** Trang chính tương ứng với vai trò sau khi đăng nhập. */
export function getHomePathForRole(roleName) {
  switch (roleName) {
    case 'Admin':
      return '/admin';
    case 'Manager':
      return '/manager';
    case 'Staff':
      return '/staff';
    case 'User':
      return '/reservations';
    default:
      return '/dashboard';
  }
}

/** Sau đăng nhập: dùng URL được yêu cầu trước đó chỉ khi vai trò mới có quyền truy cập. */
export function resolveRedirectAfterLogin(roleName, requestedPath) {
  const fallback = getHomePathForRole(roleName);
  if (!requestedPath || requestedPath === '/login') return fallback;
  return canRoleAccessPath(roleName, requestedPath) ? requestedPath : fallback;
}
