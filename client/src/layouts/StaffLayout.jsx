import SidebarShell from './SidebarShell';

// Menu khu vực Nhân viên (Staff). Trang vận hành là MỘT trang nhiều mục, nên mỗi mục là một
// giá trị của query ?tab= thay vì một route riêng — sidebar tô sáng theo `query` (xem SidebarShell).
// isDefault: mục hiện khi URL chưa có ?tab= (vào thẳng /staff).
const tabs = [
  { to: '/staff?tab=checkin', label: 'Check-in (xe vào)', query: 'checkin', isDefault: true },
  { to: '/staff?tab=active', label: 'Phiên hoạt động', query: 'active' },
  { to: '/staff?tab=reservation', label: 'Đặt chỗ vào', query: 'reservation' },
  { to: '/staff?tab=booth', label: 'Thu tiền mặt (ra)', query: 'booth' },
  { to: '/staff?tab=incident', label: 'Sự cố', query: 'incident' },
  { to: '/staff?tab=passes', label: 'Vé tháng', query: 'passes' },
];

export default function StaffLayout() {
  return <SidebarShell tabs={tabs} />;
}
