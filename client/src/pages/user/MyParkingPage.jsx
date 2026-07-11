import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Car, RefreshCw, MapPin } from 'lucide-react';
import { sessionsApi } from '../../api/sessions';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { ErrorAlert } from '../../components/ui/Field';

const fmtMoney = (v) => `${Number(v || 0).toLocaleString('vi-VN')} ₫`;

const fmtDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

// Thời gian đã đỗ từ time_in -> hiện tại (dạng "2h 15p").
const fmtElapsed = (timeIn) => {
  if (!timeIn) return '—';
  const mins = Math.max(0, Math.floor((Date.now() - new Date(timeIn).getTime()) / 60000));
  const h = Math.floor(mins / 60);
  return h > 0 ? `${h}h ${mins % 60}p` : `${mins}p`;
};

// Vị trí đỗ: tầng · khu · chỗ (theo dữ liệu chỗ đỗ đã gán).
const formatLocation = (s) => {
  const floor = s.slot?.zone?.floor?.label || s.slot?.zone?.floor?.floor_code;
  const parts = [
    floor && `Tầng ${floor}`,
    s.slot?.zone?.label && `Khu ${s.slot.zone.label}`,
    s.slot?.slot_code && `Chỗ ${s.slot.slot_code}`,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : '—';
};

// QR còn dùng được (mở cổng tầng + cổng ra); token đơn đã đóng bị bẻ 'revoked-…'.
const hasLiveQr = (s) => s.qr_token && !String(s.qr_token).startsWith('revoked-');

export default function MyParkingPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (mode = 'initial') => {
    if (mode === 'manual') setRefreshing(true);
    else setLoading(true);
    try {
      const { data } = await sessionsApi.mineActive();
      setItems(data.data ?? []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Không tải được danh sách xe trong bãi');
    } finally {
      if (mode === 'manual') setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load('initial');
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Xe trong bãi"
        description="Xe của bạn đang gửi, phí tạm tính và mã QR để ra cổng"
        actions={
          <Button variant="ghost" size="sm" onClick={() => load('manual')} loading={refreshing} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
            Làm mới
          </Button>
        }
      />

      <ErrorAlert message={error} />

      {loading ? (
        <Card>
          <TableSkeleton rows={2} cols={4} />
        </Card>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Car}
          title="Không có xe nào trong bãi"
          description="Khi xe của bạn được ghi nhận vào bãi, thông tin sẽ hiển thị ở đây"
          action={
            <Link to="/reservations/new">
              <Button>Đặt chỗ mới</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((s) => (
            <Card key={s.session_id}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-semibold text-slate-800">{s.plate_number}</span>
                    <Badge status="active" label="Đang gửi" />
                    {s.overstay && <Badge status="exception" label="Quá giờ" />}
                  </div>
                  <p className="flex items-center gap-1 text-sm text-slate-600">
                    <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
                    {formatLocation(s)}
                  </p>
                  <p className="text-sm text-slate-500">
                    {s.vehicleType?.type_name ? `${s.vehicleType.type_name} · ` : ''}
                    Vào lúc {fmtDateTime(s.time_in)} · Đã gửi {fmtElapsed(s.time_in)}
                  </p>
                  <p className="text-sm">
                    <span className="text-slate-500">Phí tạm tính: </span>
                    {s.passCovered ? (
                      <span className="font-medium text-emerald-600">Vé tháng · miễn phí</span>
                    ) : s.estimatedFee != null ? (
                      <span className="font-semibold text-brand">{fmtMoney(s.estimatedFee)}</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </p>
                  {s.overstay && (
                    <p className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
                      Xe đã gửi quá thời gian tối đa — có thể bị thu phụ thu lố giờ khi ra cổng.
                    </p>
                  )}
                </div>

                {hasLiveQr(s) && (
                  <div className="flex shrink-0 flex-col items-center gap-1 rounded-lg border border-slate-200 bg-white p-2">
                    <QRCodeSVG value={s.qr_token} size={120} aria-label="Mã QR ra cổng" />
                    <span
                      className="max-w-[120px] cursor-default select-all break-all font-mono text-[10px] text-slate-400"
                      title={s.qr_token}
                    >
                      {s.qr_token}
                    </span>
                    <span className="text-center text-xs text-slate-500">Quét ở cổng tầng &amp; cổng ra khi rời bãi</span>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
