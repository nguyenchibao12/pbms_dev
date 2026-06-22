import { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { CalendarPlus, RefreshCw, MapPin, CheckCircle2 } from 'lucide-react';
import { reservationsApi } from '../../api/reservations';
import { formatShiftLabel } from '../../lib/shifts';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { ErrorAlert } from '../../components/ui/Field';
import Modal, { ModalActions } from '../../components/ui/Modal';
import { toast } from '../../components/ui/toast';

const fmtMoney = (v) => `${Number(v || 0).toLocaleString('vi-VN')} ₫`;

const fmtDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Vị trí đỗ: tầng · khu · chỗ (lấy theo dữ liệu có sẵn trong đơn).
const formatLocation = (r) => {
  const floor = r.floor?.label || r.floor?.floor_code;
  const parts = [
    floor && `Tầng ${floor}`,
    r.zone?.zone_code && `Khu ${r.zone.zone_code}`,
    r.slot?.slot_code && `Chỗ ${r.slot.slot_code}`,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Hệ thống sẽ gán chỗ trống tốt nhất';
};

// Link thanh toán PayOS còn dang dở của đơn (từ payment pending).
const pendingCheckoutUrl = (r) => {
  const payment = r.payments?.find((p) => p.status === 'pending');
  if (!payment?.gateway_response) return null;
  try {
    return JSON.parse(payment.gateway_response).checkoutUrl || null;
  } catch {
    return null;
  }
};

const isCancellable = (status) => status === 'pending' || status === 'confirmed';

export default function MyReservationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  const load = useCallback(async (mode = 'initial') => {
    if (mode === 'manual') setRefreshing(true);
    else setLoading(true);
    try {
      const { data } = await reservationsApi.listMine();
      setItems(data.data ?? []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Không tải được danh sách đặt chỗ');
    } finally {
      if (mode === 'manual') setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load('initial');
  }, [load]);

  // PayOS redirect quay về /reservations?status=...|cancel=... — báo trạng thái rồi tải lại.
  // Server tự xác nhận thanh toán qua webhook; ở đây chỉ làm mới danh sách.
  useEffect(() => {
    const orderCode = searchParams.get('orderCode');
    const cancelled =
      searchParams.get('cancel') === 'true' || searchParams.get('status') === 'CANCELLED';
    if (!orderCode && !cancelled) return;

    const cleared = new URLSearchParams(searchParams);
    ['orderCode', 'status', 'cancel', 'code', 'id'].forEach((k) => cleared.delete(k));
    setSearchParams(cleared, { replace: true });

    if (cancelled) {
      toast.info('Đã hủy thanh toán đặt chỗ');
    } else {
      toast.success('Đã nhận thanh toán — đang cập nhật trạng thái đơn');
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load('manual');
  }, [searchParams, setSearchParams, load]);

  const handleCancel = async () => {
    if (!cancelTarget || cancelLoading) return;
    setCancelLoading(true);
    try {
      const { data } = await reservationsApi.cancel(cancelTarget.reservation_id);
      const refund = data.data?.refund;
      let msg = 'Đã hủy đặt chỗ — chỗ đã được trả lại bãi';
      if (refund?.eligible) {
        msg = `Đã hủy — sẽ hoàn ${fmtMoney(refund.amount)} phí giữ chỗ (xử lý trong vài ngày)`;
      } else if (refund?.applicable) {
        msg = 'Đã hủy — hủy sát giờ vào nên phí giữ chỗ không được hoàn';
      }
      toast.success(msg);
      setCancelTarget(null);
      await load('manual');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Hủy thất bại');
    } finally {
      setCancelLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Đơn của tôi"
        description="Theo dõi trạng thái đặt chỗ, thanh toán phí và lấy mã QR check-in"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => load('manual')}
              loading={refreshing}
              disabled={loading}
            >
              <RefreshCw className="h-4 w-4" />
              Làm mới
            </Button>
            <Link to="/availability">
              <Button variant="secondary" size="sm">
                <MapPin className="h-4 w-4" />
                Xem chỗ trống
              </Button>
            </Link>
            <Link to="/reservations/new">
              <Button size="sm">
                <CalendarPlus className="h-4 w-4" />
                Đặt chỗ mới
              </Button>
            </Link>
          </div>
        }
      />

      <ErrorAlert message={error} />

      {loading ? (
        <Card>
          <TableSkeleton rows={3} cols={4} />
        </Card>
      ) : items.length === 0 ? (
        <EmptyState
          icon={CalendarPlus}
          title="Chưa có đặt chỗ"
          description="Nhấn Đặt chỗ mới để giữ chỗ trước khi đến bãi"
          action={
            <Link to="/reservations/new">
              <Button>Đặt chỗ mới</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((r) => {
            const checkoutUrl = pendingCheckoutUrl(r);
            const showQr =
              r.status === 'confirmed' &&
              r.qr_token &&
              !String(r.qr_token).startsWith('revoked-');
            return (
              <Card key={r.reservation_id}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-semibold text-slate-800">{r.plate_number}</span>
                      <Badge status={r.status} />
                    </div>
                    <p className="text-sm text-slate-600">{formatLocation(r)}</p>
                    <p className="text-sm text-slate-500">
                      {r.vehicleType?.type_name ? `${r.vehicleType.type_name} · ` : ''}
                      {fmtDateTime(r.start_time)} → {fmtDateTime(r.end_time)}
                    </p>
                    {formatShiftLabel(r.reservation_type) && (
                      <p className="text-xs text-slate-400">{formatShiftLabel(r.reservation_type)}</p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-end">
                    {r.status === 'pending' && checkoutUrl && (
                      <Button size="sm" onClick={() => window.location.assign(checkoutUrl)}>
                        Thanh toán {fmtMoney(r.payments?.[0]?.amount)}
                      </Button>
                    )}
                    {isCancellable(r.status) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600"
                        onClick={() => setCancelTarget(r)}
                      >
                        Hủy đặt chỗ
                      </Button>
                    )}
                    {r.status === 'completed' && (
                      <span className="flex items-center gap-1 text-xs font-medium text-green-600">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Đã hoàn tất
                      </span>
                    )}
                    {r.status === 'cancelled' && (
                      <span className="text-xs text-slate-500">QR không còn hiệu lực</span>
                    )}
                  </div>
                </div>

                {showQr && (
                  <div className="mt-4 flex flex-col items-center gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:justify-between">
                    <div className="text-sm text-slate-500">
                      <p>
                        Đưa mã QR cho nhân viên tại cổng vào · Chỗ{' '}
                        <strong>{r.slot?.slot_code || '—'}</strong>
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Đến muộn quá hạn giữ chỗ có thể bị hủy (no-show)
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-2">
                      <QRCodeSVG value={r.qr_token} size={120} aria-label="Mã QR check-in" />
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={!!cancelTarget}
        title="Hủy đặt chỗ"
        onClose={() => !cancelLoading && setCancelTarget(null)}
        footer={
          <ModalActions
            onCancel={() => setCancelTarget(null)}
            onConfirm={handleCancel}
            confirmLabel="Hủy đặt chỗ"
            cancelLabel="Giữ lại"
            loading={cancelLoading}
          />
        }
      >
        <p className="text-sm text-slate-600">
          {cancelTarget?.status === 'pending'
            ? 'Bỏ giữ chỗ này? Bạn chưa thanh toán nên không bị tính phí — chỗ sẽ được trả lại bãi.'
            : 'Hủy đặt chỗ đã thanh toán? Phí giữ chỗ được hoàn theo chính sách (hủy sát giờ vào có thể không được hoàn). Chỗ sẽ được trả lại bãi.'}
        </p>
      </Modal>
    </div>
  );
}
