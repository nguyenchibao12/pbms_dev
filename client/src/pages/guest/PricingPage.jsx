import { useEffect, useState } from 'react';
import { publicApi } from '../../api/public';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import { TableSkeleton } from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import { ErrorAlert } from '../../components/ui/Field';
import { Receipt } from 'lucide-react';

const formatVnd = (v) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(v);

export default function PricingPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    publicApi
      .pricing()
      .then(({ data }) => setItems(data.data))
      .catch((err) => setError(err.response?.data?.error?.message || 'Không tải được bảng giá'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <PageHeader
        title="Bảng giá công khai"
        description="Giá đỗ xe đang hiệu lực theo loại phương tiện — không cần đăng nhập"
      />

      {error && <ErrorAlert message={error} className="mb-4" />}

      {loading ? (
        <TableSkeleton rows={3} cols={4} />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState icon={Receipt} title="Chưa có bảng giá" description="Quản lý chưa cấu hình quy tắc giá." />
        </Card>
      ) : (
        <Card padding={false} className="overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3">Loại xe</th>
                <th className="px-4 py-3">Đơn vị tính</th>
                <th className="px-4 py-3">Giá cơ bản</th>
                <th className="px-4 py-3">Hiệu lực</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.vehicleTypeId} className="border-b border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {row.typeName}
                    <span className="ml-2 text-xs text-slate-400">({row.typeCode})</span>
                  </td>
                  <td className="px-4 py-3">{row.unit} phút / đơn vị</td>
                  <td className="px-4 py-3 font-semibold text-brand">{formatVnd(row.baseRate)}</td>
                  <td className="px-4 py-3 text-slate-500">
                    Từ {new Date(row.effectiveFrom).toLocaleDateString('vi-VN')}
                    {row.effectiveTo && ` → ${new Date(row.effectiveTo).toLocaleDateString('vi-VN')}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <p className="mt-4 text-xs text-slate-400">
        Phí tính theo block thời gian (làm tròn lên). Phí đặt chỗ và vé tháng xem tại trang Quy định.
      </p>
    </>
  );
}
