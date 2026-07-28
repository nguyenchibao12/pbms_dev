import SidebarShell from './SidebarShell';

// Menu khu vực Nhân viên (Staff). Hiện có 1 mục Vận hành; module sau thêm dòng vào đây.
const tabs = [
  { to: '/staff', label: 'Vận hành bãi', end: true },
];

export default function StaffLayout() {
  return <SidebarShell tabs={tabs} />;
}
