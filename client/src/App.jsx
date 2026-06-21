import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from './components/ui/toast';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './layouts/MainLayout';
import ManagerLayout from './layouts/ManagerLayout';
import GuestLayout from './layouts/GuestLayout';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import FloorsPage from './pages/manager/FloorsPage';
import VehicleTypesPage from './pages/manager/VehicleTypesPage';
import PricingRulesPage from './pages/manager/PricingRulesPage';
import ZonesPage from './pages/manager/ZonesPage';
import ParkingSlotsPage from './pages/manager/ParkingSlotsPage';
import PricingPage from './pages/guest/PricingPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" richColors closeButton />
        <Routes>
          <Route element={<MainLayout />}>
            <Route index element={<HomePage />} />
          </Route>

          {/* Khu công khai (Guest) — không cần đăng nhập, GuestLayout bọc header/nav/footer */}
          <Route element={<GuestLayout />}>
            <Route path="/pricing" element={<PricingPage />} />
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
              <Route index element={<Navigate to="floors" replace />} />
              <Route path="floors" element={<FloorsPage />} />
              <Route path="vehicle-types" element={<VehicleTypesPage />} />
              <Route path="pricing-rules" element={<PricingRulesPage />} />
              <Route path="zones" element={<ZonesPage />} />
              <Route path="parking-slots" element={<ParkingSlotsPage />} />
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
