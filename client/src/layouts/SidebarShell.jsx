import { useState } from 'react';
import { Outlet, Link, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLogout } from '../hooks/useLogout';
import { getRoleName, roleLabels } from '../lib/auth';

// Khung sườn chung cho các khu vực cần đăng nhập (Admin/Manager/Staff/User):
// - Header ngang full width dính trên cùng: logo + badge vai trò bên trái, cụm tài khoản
//   (tên, Hồ sơ, Đăng xuất) bên phải — giữ nguyên như bản cũ.
// - Điều hướng chuyển thành cột dọc bên trái (thay dãy tab ngang trước đây).
//   Dưới lg sidebar ẩn đi, mở bằng nút ☰ trên header dưới dạng drawer.
// Layout của từng vai trò chỉ cần truyền `tabs` (và `accountLinks` nếu có mục riêng ở
// cụm tài khoản, ví dụ Hồ sơ của User).

const navLinkClass = ({ isActive }) =>
  `block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive
      ? 'bg-brand-light font-semibold text-brand'
      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
  }`;

// Danh sách menu — dùng chung cho sidebar desktop lẫn drawer mobile.
function NavList({ tabs, onNavigate }) {
  return (
    <nav className="space-y-1 px-3 py-4">
      {tabs.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.end} className={navLinkClass} onClick={onNavigate}>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}

export default function SidebarShell({ tabs, accountLinks = [] }) {
  const { user } = useAuth();
  const logout = useLogout();
  const roleName = getRoleName(user);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-surface text-slate-800">
      {/* h-16 cố định để sidebar bên dưới tính được chiều cao còn lại (top-16 / 100vh-4rem) */}
      <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-slate-200/70 bg-surface-raised/80 px-4 backdrop-blur">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMobileOpen((open) => !open)}
            aria-label={mobileOpen ? 'Đóng menu' : 'Mở menu'}
            aria-expanded={mobileOpen}
            className="-ml-1 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 lg:hidden"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>

          <Link to="/" className="flex items-center gap-2">
            <span className="brand-gradient flex h-9 w-9 items-center justify-center rounded-xl text-base font-bold text-white shadow-(--shadow-soft)">
              P
            </span>
            <span className="text-lg font-extrabold tracking-tight text-slate-800">
              PBMS<span className="text-accent">.</span>
            </span>
          </Link>

          <span className="ml-1 hidden rounded-full bg-brand-light px-2.5 py-0.5 text-xs font-medium text-brand sm:inline">
            {roleLabels[roleName] || roleName}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-slate-500 sm:inline">{user?.fullName || user?.username}</span>
          {accountLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm font-medium ${
                  isActive ? 'text-brand' : 'text-slate-500 hover:text-slate-800'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
          <button
            onClick={logout}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-800"
          >
            Đăng xuất
          </button>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 self-start overflow-y-auto border-r border-slate-200/70 bg-surface-raised lg:block">
          <NavList tabs={tabs} />
        </aside>

        {/* Drawer mobile — nằm dưới header, bấm backdrop hoặc bấm link đều đóng */}
        {mobileOpen && (
          <div className="fixed inset-x-0 bottom-0 top-16 z-40 lg:hidden">
            <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-64 overflow-y-auto bg-surface-raised shadow-(--shadow-modal)">
              <NavList tabs={tabs} onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        )}

        <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 py-8 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
