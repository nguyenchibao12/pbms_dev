import SidebarShell from './SidebarShell';

// Menu khu vực Quản trị (Admin) — thêm module mới chỉ cần thêm 1 dòng + route trong App.jsx.
// Không còn trang "Tổng quan": /admin chuyển thẳng vào Người dùng (Navigate trong App.jsx).
const tabs = [
  { to: '/admin/users', label: 'Người dùng' },
  { to: '/admin/incidents', label: 'Sự cố' },
  { to: '/admin/refunds', label: 'Hoàn tiền' },
  { to: '/admin/audit-logs', label: 'Nhật ký' },
];

export default function AdminLayout() {
  return <SidebarShell tabs={tabs} />;
}
