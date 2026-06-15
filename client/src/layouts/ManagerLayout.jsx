import { Outlet, Link, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLogout } from '../hooks/useLogout';
import { getRoleName, roleLabels } from '../lib/auth';

// Các tab khu vực Quản lý — module sau chỉ cần thêm dòng vào đây + route trong App.jsx.
const tabs = [
  { to: '/manager/floors', label: 'Tầng' },
  { to: '/manager/vehicle-types', label: 'Loại xe' },
  { to: '/manager/pricing-rules', label: 'Bảng giá' },
];

export default function ManagerLayout() {
  const { user } = useAuth();
  const logout = useLogout();
  const roleName = getRoleName(user);

  return (
    <div className="flex min-h-screen flex-col bg-surface text-slate-800">
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-surface-raised/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <span className="brand-gradient flex h-9 w-9 items-center justify-center rounded-xl text-base font-bold text-white shadow-(--shadow-soft)">
              P
            </span>
            <span className="text-lg font-extrabold tracking-tight text-slate-800">
              PBMS<span className="text-accent">.</span>
            </span>
            <span className="ml-1 hidden rounded-full bg-brand-light px-2.5 py-0.5 text-xs font-medium text-brand sm:inline">
              {roleLabels[roleName] || roleName}
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:inline">{user?.fullName || user?.username}</span>
            <button
              onClick={logout}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-800"
            >
              Đăng xuất
            </button>
          </div>
        </div>

        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-brand text-brand'
                    : 'border-transparent text-slate-500 hover:text-brand'
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
