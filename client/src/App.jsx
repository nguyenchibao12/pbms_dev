import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from './components/ui/toast';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './layouts/MainLayout';
import ManagerLayout from './layouts/ManagerLayout';
import AdminLayout from './layouts/AdminLayout';
import StaffLayout from './layouts/StaffLayout';
import GuestLayout from './layouts/GuestLayout';
import UserLayout from './layouts/UserLayout';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import DashboardPage from './pages/DashboardPage';
import AdminHomePage from './pages/admin/AdminHomePage';
import UserManagementPage from './pages/admin/UserManagementPage';
import AuditLogsPage from './pages/admin/AuditLogsPage';
import FloorsPage from './pages/manager/FloorsPage';
import VehicleTypesPage from './pages/manager/VehicleTypesPage';
import PricingRulesPage from './pages/manager/PricingRulesPage';
import ZonesPage from './pages/manager/ZonesPage';
import ParkingSlotsPage from './pages/manager/ParkingSlotsPage';
import GatesPage from './pages/manager/GatesPage';
import StaffOperationsPage from './pages/staff/StaffOperationsPage';
import PricingPage from './pages/guest/PricingPage';
import AvailabilityPage from './pages/guest/AvailabilityPage';
import InfoPage from './pages/guest/InfoPage';
import MyReservationsPage from './pages/user/MyReservationsPage';
import ReservePage from './pages/user/ReservePage';
import GateKioskPage from './pages/kiosk/GateKioskPage';
import PaymentSuccessPage from './pages/user/PaymentSuccessPage';
import PaymentFailedPage from './pages/user/PaymentFailedPage';

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
            <Route path="/availability" element={<AvailabilityPage />} />
            <Route path="/info" element={<InfoPage />} />
          </Route>

          {/* Kiosk cổng tự phục vụ — công khai, KHÔNG đăng nhập (xác thực bằng kiosk key) */}
          <Route path="/kiosk/gate" element={<GateKioskPage />} />

          {/* Trang công khai */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Cần đăng nhập (mọi vai trò) */}
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
          </Route>

          {/* Khu vực Quản trị — AdminLayout (header + tab nav) bọc các trang con */}
          <Route element={<ProtectedRoute allowedRoles={['Admin']} />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminHomePage />} />
              <Route path="users" element={<UserManagementPage />} />
              <Route path="audit-logs" element={<AuditLogsPage />} />
            </Route>
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
              <Route path="gates" element={<GatesPage />} />
            </Route>
          </Route>
          {/* Khu vực Nhân viên — StaffLayout bọc trang vận hành */}
          <Route element={<ProtectedRoute allowedRoles={['Staff']} />}>
            <Route path="/staff" element={<StaffLayout />}>
              <Route index element={<StaffOperationsPage />} />
            </Route>
          </Route>

          {/* Khu vực Khách hàng — UserLayout bọc các trang đặt chỗ */}
          <Route element={<ProtectedRoute allowedRoles={['User']} />}>
            <Route path="/reservations" element={<UserLayout />}>
              <Route index element={<MyReservationsPage />} />
              <Route path="new" element={<ReservePage />} />
              <Route path="payment/success" element={<PaymentSuccessPage />} />
              <Route path="payment/failed" element={<PaymentFailedPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
