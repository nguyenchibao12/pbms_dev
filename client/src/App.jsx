import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from './components/ui/toast';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './layouts/MainLayout';
import ManagerLayout from './layouts/ManagerLayout';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import VehicleTypesPage from './pages/manager/VehicleTypesPage';
import PricingRulesPage from './pages/manager/PricingRulesPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" richColors closeButton />
        <Routes>
          <Route element={<MainLayout />}>
            <Route index element={<HomePage />} />
          </Route>

          {/* Trang công khai */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Cần đăng nhập (mọi vai trò) */}
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
          </Route>

          {/* Phân quyền theo vai trò — tạm dùng chung DashboardPage, module sau sẽ thay riêng */}
          <Route element={<ProtectedRoute allowedRoles={['Admin']} />}>
            <Route path="/admin" element={<DashboardPage />} />
          </Route>
          {/* Khu vực Quản lý — ManagerLayout (header + tab nav) bọc các trang con */}
          <Route element={<ProtectedRoute allowedRoles={['Manager']} />}>
            <Route path="/manager" element={<ManagerLayout />}>
              <Route index element={<Navigate to="vehicle-types" replace />} />
              <Route path="vehicle-types" element={<VehicleTypesPage />} />
              <Route path="pricing-rules" element={<PricingRulesPage />} />
            </Route>
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['Staff']} />}>
            <Route path="/staff" element={<DashboardPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['User']} />}>
            <Route path="/reservations" element={<DashboardPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
