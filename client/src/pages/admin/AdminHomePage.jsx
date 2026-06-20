import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Card from '../../components/ui/Card';

// Trang tổng quan khu Quản trị (Admin) — điểm vào, dẫn tới các mục con.
const sections = [
  { to: '/admin/users', title: 'Quản lý người dùng', desc: 'Tạo, khóa/mở, đổi vai trò tài khoản người dùng.' },
  { to: '/admin/audit-logs', title: 'Nhật ký hệ thống', desc: 'Xem lịch sử thao tác (lọc + phân trang).' },
];

export default function AdminHomePage() {
  const { user } = useAuth();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Bảng điều khiển Quản trị</h1>
        <p className="mt-1 text-sm text-slate-500">
          Xin chào <strong>{user?.fullName || user?.username}</strong> — chọn một mục để bắt đầu.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {sections.map((s) => (
          <Link key={s.to} to={s.to}>
            <Card className="h-full transition-all hover:-translate-y-1 hover:shadow-(--shadow-soft)">
              <h3 className="text-lg font-semibold text-slate-800">{s.title}</h3>
              <p className="mt-1.5 text-sm text-slate-500">{s.desc}</p>
              <span className="mt-3 inline-block text-sm font-medium text-brand">Mở →</span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
