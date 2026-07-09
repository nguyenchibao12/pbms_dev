import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { TicketPlus, RefreshCw, CreditCard, CheckCircle2, Clock } from 'lucide-react';
import { monthlyPassApi } from '../../api/monthlyPass';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { ErrorAlert } from '../../components/ui/Field';
import Modal, { ModalActions } from '../../components/ui/Modal';
import { toast } from '../../components/ui/toast';

// Ngày hiệu lực lưu dạng DATEONLY 'YYYY-MM-DD' → 'DD/MM/YYYY' (không lệ thuộc múi giờ).
const fmtDate = (value) => {
  if (!value) return '—';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  if (!y || !m || !d) return '—';
  return `${d}/${m}/${y}`;
};

// Khung giờ lưu dạng TIME 'HH:MM:SS' → 'HH:MM'.
const fmtTime = (value) => (value ? String(value).slice(0, 5) : '');

const dailyWindowLabel = (pass) => {
  const from = fmtTime(pass.valid_from_time);
  const to = fmtTime(pass.valid_to_time);
  return from && to ? `${from}–${to}` : '—';
};

export default function MyMonthlyPassesPage() {
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [repayingId, setRepayingId] = useState(null);

  const load = useCallback(async (mode = 'initial') => {
    if (mode === 'manual') setRefreshing(true);
    else setLoading(true);
    try {
      const { data } = await monthlyPassApi.listMine();
      setItems(data.data ?? []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Không tải được danh sách vé tháng');
    } finally {
      if (mode === 'manual') setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  // PayOS redirect quay về /monthly-pass?orderCode=...|cancel=... (returnUrl/cancelUrl cố định ở BE).
  // Suy ra kết quả để đưa sang trang hứng riêng — thành công (PAID) hay thất bại (cancel/CANCELLED).
  const paymentResult = useMemo(() => {
    const orderCode = searchParams.get('orderCode');
    const status = searchParams.get('status');
    const cancelled = searchParams.get('cancel') === 'true' || status === 'CANCELLED';
    if (!orderCode && !cancelled) return null;
    return { type: cancelled ? 'failed' : 'success', orderCode: orderCode || '' };
  }, [searchParams]);

  useEffect(() => {
    if (paymentResult) return; // Đang chuyển sang trang kết quả — khỏi tải danh sách.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load('initial');
  }, [load, paymentResult]);

  const handleRepay = async (pass) => {
    if (repayingId) return;
    setRepayingId(pass.pass_id);
    try {
      const { data } = await monthlyPassApi.repay(pass.pass_id);
      const checkoutUrl = data.data?.checkoutUrl;
      if (!checkoutUrl) throw new Error('Không nhận được link thanh toán');
      toast.success('Chuyển sang thanh toán vé tháng');
      window.location.assign(checkoutUrl);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || err.message || 'Không lấy được link thanh toán');
      setRepayingId(null);
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget || cancelLoading) return;
    setCancelLoading(true);
    try {
      const { data } = await monthlyPassApi.cancel(cancelTarget.pass_id);
      // BE trả thông điệp đầy đủ (đã hủy + % hoàn + hạn cập nhật STK, hoặc không hoàn).
      toast.success(data.message || 'Đã hủy vé tháng');
      setCancelTarget(null);
      await load('manual');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Hủy vé thất bại');
    } finally {
      setCancelLoading(false);
    }
  };

  if (paymentResult) {
    const qs = paymentResult.orderCode ? `?orderCode=${paymentResult.orderCode}` : '';
    return <Navigate to={`/monthly-pass/payment/${paymentResult.type}${qs}`} replace />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vé tháng của tôi"
        description="Theo dõi vé tháng, thanh toán, lấy mã QR check-in và hủy vé khi cần"
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
            <Link to="/monthly-pass/new">
              <Button size="sm">
                <TicketPlus className="h-4 w-4" />
                Mua vé tháng
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
          icon={TicketPlus}
          title="Chưa có vé tháng"
          description="Mua vé tháng để gửi xe cố định theo tháng, không cần đặt chỗ từng ngày"
          action={
            <Link to="/monthly-pass/new">
              <Button>Mua vé tháng</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((pass) => {
            const showQr =
              pass.status === 'active' &&
              pass.qr_token &&
              !String(pass.qr_token).startsWith('revoked-');
            const cancellable = pass.status === 'pending' || pass.status === 'active';
            return (
              <Card key={pass.pass_id}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-semibold text-slate-800">{pass.plate_number}</span>
                      <Badge status={pass.status} />
                    </div>
                    <p className="text-sm text-slate-600">
                      {pass.vehicleType?.type_name ? `${pass.vehicleType.type_name} · ` : ''}
                      Tầng {pass.floor?.label || pass.floor?.floor_code || '—'}
                    </p>
                    <p className="text-sm text-slate-500">
                      {fmtDate(pass.start_date)} → {fmtDate(pass.end_date)}
                    </p>
                    <p className="text-xs text-slate-400">Khung giờ hằng ngày: {dailyWindowLabel(pass)}</p>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-end">
                    {pass.status === 'pending' && (
                      <Button
                        size="sm"
                        onClick={() => handleRepay(pass)}
                        loading={repayingId === pass.pass_id}
                        disabled={!!repayingId}
                      >
                        <CreditCard className="h-4 w-4" />
                        Trả tiếp
                      </Button>
                    )}
                    {cancellable && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600"
                        onClick={() => setCancelTarget(pass)}
                      >
                        Hủy vé
                      </Button>
                    )}
                    {pass.status === 'expired' && (
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <Clock className="h-3.5 w-3.5" />
                        Đã hết hạn
                      </span>
                    )}
                    {pass.status === 'cancelled' && (
                      <span className="text-xs text-slate-500">Vé đã hủy</span>
                    )}
                  </div>
                </div>

                {showQr && (
                  <div className="mt-4 flex flex-col items-center gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:justify-between">
                    <div className="text-sm text-slate-500">
                      <p className="flex items-center gap-1 font-medium text-emerald-600">
                        <CheckCircle2 className="h-4 w-4" />
                        Vé đang hiệu lực
                      </p>
                      <p className="mt-1">Quét mã QR tại cổng để vào bãi trong khung giờ hằng ngày.</p>
                    </div>
                    <div className="flex flex-col items-center gap-1 rounded-lg border border-slate-200 bg-white p-2">
                      <QRCodeSVG value={pass.qr_token} size={120} aria-label="Mã QR vé tháng" />
                      <span
                        className="max-w-[120px] cursor-default select-all break-all font-mono text-[10px] text-slate-400"
                        title={pass.qr_token}
                      >
                        {pass.qr_token}
                      </span>
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
        title="Hủy vé tháng"
        onClose={() => !cancelLoading && setCancelTarget(null)}
        footer={
          <ModalActions
            onCancel={() => setCancelTarget(null)}
            onConfirm={handleCancel}
            confirmLabel="Hủy vé"
            cancelLabel="Giữ lại"
            loading={cancelLoading}
          />
        }
      >
        {cancelTarget?.status === 'pending' ? (
          <p className="text-sm text-slate-600">
            Bỏ vé này? Bạn chưa thanh toán nên không phát sinh hoàn tiền — suất vé tháng sẽ được trả lại.
          </p>
        ) : (
          <div className="space-y-3 text-sm text-slate-600">
            <p>Hủy vé đã thanh toán? Mã QR sẽ ngừng hiệu lực. % hoàn tiền tính theo thời điểm hủy:</p>
            <ul className="space-y-1 rounded-lg bg-slate-50 px-4 py-3 text-slate-600">
              <li>· Trước ngày hiệu lực: <strong>hoàn 100%</strong></li>
              <li>· 3 ngày đầu hiệu lực: <strong>hoàn 70%</strong></li>
              <li>· Tới hết nửa thời hạn: <strong>hoàn 50%</strong></li>
              <li>· Quá nửa thời hạn: <strong>không hoàn</strong></li>
            </ul>
            <p className="text-xs text-slate-400">
              Nếu có tiền hoàn, hệ thống tạo yêu cầu hoàn tiền — bạn cần cập nhật số tài khoản ngân hàng
              trong hồ sơ để nhận tiền. Số tiền hoàn chính xác hiển thị sau khi xác nhận hủy.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
