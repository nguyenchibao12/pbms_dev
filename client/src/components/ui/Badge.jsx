import { cn } from '../../lib/cn';

const colors = {
  available: 'bg-green-100 text-green-800',
  reserved: 'bg-yellow-100 text-yellow-800',
  occupied: 'bg-red-100 text-red-800',
  maintenance: 'bg-slate-200 text-slate-700',
  locked: 'bg-violet-100 text-violet-800',
  expired: 'bg-slate-200 text-slate-600',
  active: 'bg-emerald-100 text-emerald-800',
  completed: 'bg-green-100 text-green-800',
  exception: 'bg-red-100 text-red-800',
  pending: 'bg-yellow-100 text-yellow-800',
  success: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  refunded: 'bg-slate-200 text-slate-700',
  confirmed: 'bg-teal-100 text-teal-800',
  checked_in: 'bg-indigo-100 text-indigo-800',
  cancelled: 'bg-slate-200 text-slate-600',
  no_show: 'bg-orange-100 text-orange-800',
  open: 'bg-amber-100 text-amber-800',
  investigating: 'bg-blue-100 text-blue-800',
  resolved: 'bg-green-100 text-green-800',
};

const roleColors = {
  Admin: 'bg-purple-100 text-purple-800',
  Manager: 'bg-brand-light text-brand',
  Staff: 'bg-accent-light text-accent',
  User: 'bg-slate-100 text-slate-700',
};

const statusLabels = {
  checked_in: 'Đã vào bãi',
  no_show: 'Không đến',
  pending: 'Chờ xử lý',
  confirmed: 'Đã xác nhận',
  cancelled: 'Đã hủy',
  completed: 'Hoàn tất',
  available: 'Trống',
  reserved: 'Đã đặt',
  occupied: 'Đang dùng',
  maintenance: 'Bảo trì',
  locked: 'Tạm khóa',
  active: 'Đang hoạt động',
  expired: 'Hết hạn',
  success: 'Thành công',
  failed: 'Thất bại',
  refunded: 'Đã hoàn',
  exception: 'Lỗi',
  open: 'Mới',
  investigating: 'Đang xử lý',
  resolved: 'Đã xử lý',
};

export default function Badge({ status, label, variant = 'status', className }) {
  const colorMap = variant === 'role' ? roleColors : colors;
  const display = label || statusLabels[status] || status?.replace(/_/g, ' ');

  return (
    <span
      className={cn(
        'inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize',
        colorMap[status] || 'bg-slate-100 text-slate-600',
        className,
      )}
    >
      {display}
    </span>
  );
}
