import { BrowserRouter, Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';

function HomePlaceholder() {
  return (
    <div className="text-center">
      <h1 className="text-3xl font-bold text-brand">PBMS</h1>
      <p className="mt-2 text-slate-500">Hệ thống quản lý bãi đỗ xe — client đang được dựng.</p>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route index element={<HomePlaceholder />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
