import { Link, Outlet, NavLink } from 'react-router-dom';
import { ParkingCircle, Receipt, Search, Info, LogOut, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLogout } from '../hooks/useLogout';
import { cn } from '../lib/cn';
import { getRoleName, roleLabels } from '../lib/auth';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';

const navItems = [
  { to: '/pricing', label: 'Bảng giá', icon: Receipt },
  { to: '/availability', label: 'Chỗ trống', icon: Search },
  { to: '/info', label: 'Quy định', icon: Info },
];

export default function GuestLayout() {
  const { user, isAuthenticated, loading } = useAuth();
  const logout = useLogout();
  const roleName = getRoleName(user);

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 lg:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="rounded-lg bg-brand p-2">
              <ParkingCircle className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-800">PBMS</p>
              <p className="text-xs text-slate-400">Parking Building Management</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive ? 'bg-brand-light text-brand' : 'text-slate-600 hover:bg-slate-50',
                    )
                  }
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            {!loading && isAuthenticated ? (
              <>
                <div className="hidden text-right sm:block">
                  <p className="text-xs font-medium text-slate-700">{user?.fullName}</p>
                  <p className="text-[10px] text-slate-400">{user?.username}</p>
                </div>
                {roleName && <Badge status={roleName} variant="role" label={roleLabels[roleName] || roleName} />}
                <Link to="/dashboard" className="hidden sm:block">
                  <Button variant="ghost" size="sm">
                    <LayoutDashboard className="h-4 w-4" />
                  </Button>
                </Link>
                <Button variant="ghost" size="sm" onClick={logout} title="Đăng xuất">
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Link to="/login">
                <Button variant="secondary" size="sm">
                  Đăng nhập
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Cảnh báo khi đăng nhập sai vai trên khu công khai */}
        {!loading && isAuthenticated && roleName && roleName !== 'User' && (
          <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-900 lg:px-6">
            Bạn đang đăng nhập <strong>{roleLabels[roleName] || roleName}</strong> ({user?.username}) — khu công khai chỉ để xem.
            Đặt chỗ cần tài khoản <strong>Khách hàng</strong>.
            <button type="button" onClick={logout} className="ml-2 font-medium text-brand underline">
              Đăng xuất
            </button>
            {' · '}
            <Link to="/login" className="font-medium text-brand underline">
              Đăng nhập User
            </Link>
          </div>
        )}

        <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 md:hidden">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium',
                  isActive ? 'bg-brand-light text-brand' : 'text-slate-600',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 lg:px-6">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-slate-500 sm:flex-row lg:px-6">
          <p>© 2026 PBMS · SU26SWP08</p>
          <div className="flex gap-4">
            <Link to="/pricing" className="hover:text-brand">
              Bảng giá
            </Link>
            <Link to="/availability" className="hover:text-brand">
              Chỗ trống
            </Link>
            <Link to="/info" className="hover:text-brand">
              Quy định
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
