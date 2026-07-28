import SidebarShell from './SidebarShell';

// Menu khu vực Khách hàng (User) — đặt chỗ + vé tháng, theo dõi đơn/vé của mình.
// "Hồ sơ" không nằm trong menu chính mà ở khối tài khoản cuối sidebar (cạnh Đăng xuất).
const tabs = [
  { to: '/reservations', label: 'Đơn của tôi', end: true },
  { to: '/reservations/new', label: 'Đặt chỗ mới' },
  { to: '/monthly-pass', label: 'Vé tháng của tôi', end: true },
  { to: '/monthly-pass/new', label: 'Mua vé tháng' },
  { to: '/parking', label: 'Xe trong bãi' },
];

const accountLinks = [{ to: '/profile', label: 'Hồ sơ' }];

export default function UserLayout() {
  return <SidebarShell tabs={tabs} accountLinks={accountLinks} />;
}
