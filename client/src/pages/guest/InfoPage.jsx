import { useEffect, useState } from 'react';
import { Clock, MapPin, Car, Phone } from 'lucide-react';
import { publicApi } from '../../api/public';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import { CardSkeleton } from '../../components/ui/Skeleton';
import { ErrorAlert } from '../../components/ui/Field';

const formatVnd = (v) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(v);

export default function InfoPage() {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    publicApi
      .info()
      .then(({ data }) => setInfo(data.data))
      .catch((err) => setError(err.response?.data?.error?.message || 'Không tải được thông tin'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <>
        <PageHeader title="Thông tin & quy định" />
        <div className="grid gap-4 sm:grid-cols-2">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Thông tin & quy định"
        description="Giờ hoạt động, loại xe hỗ trợ và nội quy bãi đỗ"
      />

      {error && <ErrorAlert message={error} className="mb-4" />}

      {info && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <h3 className="text-lg font-semibold text-slate-800">{info.buildingName}</h3>
            <ul className="mt-4 space-y-3 text-sm text-slate-600">
              <li className="flex items-start gap-3">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <span>Giờ mở cửa: <strong>{info.openHours}</strong></span>
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <span>{info.address}</span>
              </li>
              {info.contactPhone && (
                <li className="flex items-start gap-3">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                  <span>{info.contactPhone}</span>
                </li>
              )}
              <li className="flex items-start gap-3">
                <Car className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <span>
                  Loại xe:{' '}
                  {info.vehicleTypes?.map((v) => v.type_name).join(', ') || '—'}
                </span>
              </li>
            </ul>
            <div className="mt-4 rounded-lg bg-brand-light p-3 text-sm">
              <p>Phí giữ chỗ (đặt trước): <strong>{formatVnd(info.bookingFee)}</strong></p>
              {/* Khách hay tưởng phí giữ chỗ là tiền gửi xe — nói rõ đây là 2 khoản tách biệt. */}
              <p className="mt-0.5 text-xs text-slate-500">
                Thu 1 lần khi đặt chỗ, chưa gồm tiền gửi xe theo giờ (xem Bảng giá).
              </p>
              <p className="mt-2">Vé tháng từ: <strong>{formatVnd(info.monthlyPassPrice)}</strong></p>
            </div>
          </Card>

          <Card>
            <h3 className="text-lg font-semibold text-slate-800">Nội quy & hướng dẫn</h3>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-600">
              {info.rules.map((rule, i) => (
                <li key={i}>{rule}</li>
              ))}
            </ol>
          </Card>
        </div>
      )}
    </>
  );
}
