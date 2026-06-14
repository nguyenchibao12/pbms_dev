import { Link } from 'react-router-dom';
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
  const initial = (user?.fullName || user?.username || '?').charAt(0).toUpperCase();

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface px-4">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-24 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-brand/10 blur-3xl" />
      </div>

      <Card className="w-full max-w-md overflow-hidden p-0 text-center">
        <div className="brand-gradient h-20" />
        <div className="px-6 pb-6">
          <div className="brand-gradient mx-auto -mt-10 flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-surface-raised text-2xl font-bold text-white shadow-(--shadow-soft)">
            {initial}
          </div>
          <h1 className="mt-4 text-xl font-bold text-slate-800">Đăng nhập thành công</h1>
          <p className="mt-1 text-sm text-slate-600">
            Xin chào <strong>{user?.fullName || user?.username}</strong>
          </p>
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand-light px-3 py-1 text-sm font-medium text-brand">
            {roleLabels[roleName] || roleName}
          </span>

          <p className="mt-5 text-xs text-slate-400">
            Trang làm việc riêng cho vai trò này sẽ được bổ sung ở các module tiếp theo.
          </p>

          <div className="mt-6 flex flex-col gap-2">
            <Link to="/">
              <Button className="brand-gradient w-full border-0 shadow-(--shadow-soft)">Về trang chủ</Button>
            </Link>
            <Button variant="secondary" className="w-full" onClick={logout}>
              Đăng xuất
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
