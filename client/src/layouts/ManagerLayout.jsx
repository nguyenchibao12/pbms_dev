import SidebarShell from './SidebarShell';

// Menu khu vực Quản lý — module sau chỉ cần thêm dòng vào đây + route trong App.jsx.
const tabs = [
  { to: '/manager/vehicle-types', label: 'Loại xe' },
  { to: '/manager/pricing-rules', label: 'Bảng giá' },
  { to: '/manager/floors', label: 'Tầng' },
  { to: '/manager/zones', label: 'Khu vực' },
  { to: '/manager/parking-slots', label: 'Chỗ đỗ' },
  { to: '/manager/gates', label: 'Cổng' },
  { to: '/manager/reports', label: 'Báo cáo' },
  { to: '/manager/settings', label: 'Cấu hình' },
];

export default function ManagerLayout() {
  return <SidebarShell tabs={tabs} />;
}
