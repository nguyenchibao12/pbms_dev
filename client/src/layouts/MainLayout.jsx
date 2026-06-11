import { Outlet, Link } from 'react-router-dom';

/** Khung chung: header (brand) + vùng nội dung (Outlet) + footer. */
export default function MainLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-surface text-slate-800">
      <header className="border-b border-slate-200 bg-surface-raised">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-xl font-bold text-brand">
            PBMS
          </Link>
          <nav className="text-sm text-slate-500">Quản lý bãi đỗ xe</nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 py-4 text-center text-sm text-slate-400">
        © {new Date().getFullYear()} PBMS — Parking Building Management System
      </footer>
    </div>
  );
}
