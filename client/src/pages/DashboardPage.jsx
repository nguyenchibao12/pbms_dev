import { useAuth } from '../context/AuthContext';
import { useLogout } from '../hooks/useLogout';
import { getRoleName, roleLabels } from '../lib/auth';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';

/**
 * Trang landing tạm sau khi đăng nhập — dùng chung cho mọi vai trò ở giai đoạn này.
 * Các module sau sẽ thay bằng dashboard riêng cho từng vai trò.
 */
export default function DashboardPage() {
  const { user } = useAuth();
  const logout = useLogout();
  const roleName = getRoleName(user);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <Card className="w-full max-w-md text-center">
        <h1 className="text-xl font-bold text-slate-800">Đăng nhập thành công</h1>
        <p className="mt-2 text-sm text-slate-600">
          Xin chào <strong>{user?.fullName || user?.username}</strong>
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Vai trò: {roleLabels[roleName] || roleName}
        </p>
        <div className="mt-6">
          <Button variant="secondary" className="w-full" onClick={logout}>
            Đăng xuất
          </Button>
        </div>
      </Card>
    </div>
  );
}
