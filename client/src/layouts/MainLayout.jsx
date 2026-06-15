import { Outlet, Link, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLogout } from '../hooks/useLogout';
import { getRoleName, getHomePathForRole } from '../lib/auth';
import Button from '../components/ui/Button';

const navItems = [
  { to: '/', label: 'Trang chủ', end: true },
  { to: '/#features', label: 'Tính năng' },
  { to: '/#how', label: 'Cách hoạt động' },
  { to: '/#contact', label: 'Liên hệ' },
];

function BrandMark() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <span className="brand-gradient flex h-9 w-9 items-center justify-center rounded-xl text-base font-bold text-white shadow-(--shadow-soft)">
        P
      </span>
      <span className="text-lg font-extrabold tracking-tight text-slate-800">
        PBMS<span className="text-accent">.</span>
      </span>
    </Link>
  );
}

export default function MainLayout() {
  const { isAuthenticated, user } = useAuth();
  const logout = useLogout();
  const roleName = getRoleName(user);

  return (
    <div className="flex min-h-screen flex-col bg-surface text-slate-800">
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-surface-raised/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <BrandMark />

          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive ? 'text-brand' : 'text-slate-600 hover:text-brand'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <>
                <Link to={getHomePathForRole(roleName)}>
                  <Button size="sm">Vào hệ thống</Button>
                </Link>
                <button
                  onClick={logout}
                  className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-800 sm:block"
                >
                  Đăng xuất
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:text-brand"
                >
                  Đăng nhập
                </Link>
                <Link to="/register">
                  <Button size="sm">Đăng ký</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer id="contact" className="border-t border-slate-200 bg-surface-raised">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <BrandMark />
            <p className="mt-3 max-w-xs text-sm text-slate-500">
              Giải pháp quản lý bãi đỗ xe thông minh — đỗ xe nhanh, tiện lợi, tối ưu chi phí.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-800">Sản phẩm</h4>
            <ul className="mt-3 space-y-2 text-sm text-slate-500">
              <li><a href="/#features" className="hover:text-brand">Tính năng</a></li>
              <li><a href="/#how" className="hover:text-brand">Cách hoạt động</a></li>
              <li><Link to="/register" className="hover:text-brand">Đăng ký</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-800">Hỗ trợ</h4>
            <ul className="mt-3 space-y-2 text-sm text-slate-500">
              <li><span className="hover:text-brand">Điều khoản</span></li>
              <li><span className="hover:text-brand">Bảo mật</span></li>
              <li><span className="hover:text-brand">Câu hỏi thường gặp</span></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-800">Liên hệ</h4>
            <ul className="mt-3 space-y-2 text-sm text-slate-500">
              <li>support@pbms.vn</li>
              <li>1900 1234</li>
              <li>TP. Hồ Chí Minh</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-slate-200 py-4 text-center text-sm text-slate-400">
          © {new Date().getFullYear()} PBMS — Parking Building Management System (Đồ án SU26SWP08)
        </div>
      </footer>
    </div>
  );
}
