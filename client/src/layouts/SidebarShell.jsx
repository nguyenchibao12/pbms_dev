import { useState } from 'react';
import { Outlet, Link, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLogout } from '../hooks/useLogout';
import { getRoleName, roleLabels } from '../lib/auth';

// Khung sườn chung cho các khu vực cần đăng nhập (Admin/Manager/Staff/User):
// thanh điều hướng dọc bên trái thay cho dãy tab ngang cũ.
// - Desktop (lg trở lên): sidebar dính cạnh trái, cao hết màn hình.
// - Mobile: header gọn + nút menu mở drawer trượt từ trái.
// Layout của từng vai trò chỉ cần truyền danh sách `tabs` (và `accountLinks`
// nếu có mục riêng ở khối tài khoản, ví dụ Hồ sơ của User).

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

// Nội dung bên trong sidebar — dùng chung cho cả bản desktop lẫn drawer mobile.
function SidebarContent({ tabs, accountLinks, onNavigate }) {
  const { user } = useAuth();
  const logout = useLogout();
  const roleName = getRoleName(user);

  const linkClass = ({ isActive }) =>
    `block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      isActive
        ? 'bg-brand-light font-semibold text-brand'
        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
    }`;

  return (
    <>
      <div className="flex items-center justify-between border-b border-slate-200/70 px-4 py-4">
        <BrandMark />
        <span className="rounded-full bg-brand-light px-2.5 py-0.5 text-xs font-medium text-brand">
          {roleLabels[roleName] || roleName}
        </span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {tabs.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.end} className={linkClass} onClick={onNavigate}>
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-200/70 px-3 py-4">
        <p className="truncate px-3 pb-2 text-sm font-medium text-slate-700">
          {user?.fullName || user?.username}
        </p>
        {accountLinks.map((link) => (
          <NavLink key={link.to} to={link.to} className={linkClass} onClick={onNavigate}>
            {link.label}
          </NavLink>
        ))}
        <button
          onClick={logout}
          className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
        >
          Đăng xuất
        </button>
      </div>
    </>
  );
}

export default function SidebarShell({ tabs, accountLinks = [] }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-surface text-slate-800">
      {/* Sidebar desktop */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200/70 bg-surface-raised lg:flex">
        <SidebarContent tabs={tabs} accountLinks={accountLinks} />
      </aside>

      {/* Drawer mobile — backdrop bấm ra ngoài để đóng, bấm link cũng đóng */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-64 flex-col bg-surface-raised shadow-(--shadow-modal)">
            <SidebarContent
              tabs={tabs}
              accountLinks={accountLinks}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header mobile — chỉ hiện dưới lg, chứa nút mở menu */}
        <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200/70 bg-surface-raised/80 px-4 py-3 backdrop-blur lg:hidden">
          <BrandMark />
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Mở menu"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
