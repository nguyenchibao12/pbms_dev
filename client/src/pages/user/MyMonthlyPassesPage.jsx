import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { TicketPlus, RefreshCw, CreditCard, CheckCircle2, Clock, SearchX } from 'lucide-react';
import { monthlyPassApi } from '../../api/monthlyPass';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import FilterBar, { DateRangeField, SearchField, SelectField } from '../../components/ui/FilterBar';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { ErrorAlert } from '../../components/ui/Field';
import Modal, { ModalActions } from '../../components/ui/Modal';
import { toast } from '../../components/ui/toast';
import { formatFloorLabel } from '../../lib/floor';
import { collectFloorOptions, inDateRange, matchPlate, overlapsDateRange } from '../../lib/filters';

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

// % hoàn → nhãn hiển thị; 0% nói thẳng "không hoàn" thay vì "hoàn 0%".
const refundPctLabel = (value) => {
  const pct = Number(value);
  return pct > 0 ? `hoàn ${pct}%` : 'không hoàn';
};

const fmtMoney = (value) => `${Number(value || 0).toLocaleString('vi-VN')} ₫`;

// Mốc thời gian đầy đủ (ngày hủy, ngày hoàn tiền) — khác fmtDate chỉ có ngày hiệu lực.
const fmtDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('vi-VN');
};

// Khoản đã trả cho vé: ưu tiên payment 'success', 'refunded' là đã trả rồi được hoàn lại.
const paidPaymentOf = (pass) =>
  (pass.payments || []).find((p) => p.status === 'success' || p.status === 'refunded') || null;

// Nhãn trạng thái cho dropdown lọc — giữ đúng chữ trên Badge của từng vé.
const STATUS_OPTIONS = [
  { value: 'pending', label: 'Chờ xử lý' },
  { value: 'active', label: 'Đang hoạt động' },
  { value: 'expired', label: 'Hết hạn' },
  { value: 'cancelled', label: 'Đã hủy' },
];

// Khoảng ngày lọc theo mốc nào: ngày mua vé hay thời hạn vé phủ.
const DATE_FIELD_OPTIONS = [
  { value: 'created_at', label: 'Ngày mua vé' },
  { value: 'validity', label: 'Ngày hiệu lực' },
];

const emptyFilters = { plate: '', status: '', floorId: '', dateField: 'created_at', from: '', to: '' };

export default function MyMonthlyPassesPage() {
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [repayingId, setRepayingId] = useState(null);
  const [refundPolicy, setRefundPolicy] = useState(null); // null = chưa đọc được → modal hiện text chung
  const [filters, setFilters] = useState(emptyFilters);

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  // dateField luôn có giá trị nên không tính là "đang lọc" — chỉ khoảng ngày mới tính.
  const filterActive = Boolean(
    filters.plate || filters.status || filters.floorId || filters.from || filters.to,
  );

  const floorOptions = useMemo(
    () => collectFloorOptions(items, (p) => p.floor).map((f) => ({ value: String(f.id), label: formatFloorLabel(f.label) })),
    [items],
  );

  const visibleItems = useMemo(
    () =>
      items.filter((p) => {
        // "Ngày hiệu lực" so theo GIAO khoảng: vé 01/07–31/07 phải hiện khi lọc riêng ngày 15/07,
        // khác với "Ngày mua vé" chỉ có một mốc.
        const dateOk =
          filters.dateField === 'validity'
            ? overlapsDateRange(p.start_date, p.end_date, filters.from, filters.to)
            : inDateRange(p.created_at, filters.from, filters.to);
        return (
          matchPlate(p.plate_number, filters.plate) &&
          (!filters.status || p.status === filters.status) &&
          (!filters.floorId || String(p.floor?.floor_id) === filters.floorId) &&
          dateOk
        );
      }),
    [items, filters],
  );

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

  // Mở modal hủy vé đã thanh toán → đọc chính sách hoàn tiền thật từ settings (Manager chỉnh được,
  // không hardcode). BE chưa có endpoint (đã gửi handoff) → nuốt lỗi, modal rơi về text chung.
  useEffect(() => {
    if (!cancelTarget || cancelTarget.status === 'pending' || refundPolicy) return undefined;
    let active = true;
    monthlyPassApi
      .refundPolicy()
      .then((res) => { if (active) setRefundPolicy(res.data.data || null); })
      .catch(() => {});
    return () => { active = false; };
  }, [cancelTarget, refundPolicy]);

  const handleRepay = async (pass) => {
    if (repayingId) return;
    setRepayingId(pass.pass_id);
    try {
      const { data } = await monthlyPassApi.repay(pass.pass_id);
      const info = data.data || {};
      // Tiền đã về, webhook chưa tới → BE tự kích hoạt vé. KHÔNG điều hướng (tránh thu tiền 2 lần).
      if (info.alreadyPaid) {
        toast.success('Vé tháng đã được thanh toán và kích hoạt');
        await load('manual');
        return;
      }
      // Link cũ còn sống (reused) hoặc link mới → sang PayOS.
      if (info.checkoutUrl) {
        toast.success('Chuyển sang thanh toán vé tháng');
        window.location.assign(info.checkoutUrl);
        return;
      }
      // Không có link mà cũng không alreadyPaid → coi như lỗi tạo link.
      toast.error('Chưa tạo được liên kết thanh toán — vui lòng thử lại');
    } catch (err) {
      // 502 = BE cố tình không phát link mới khi chưa chắc link cũ đã chết → hiện lỗi, cho bấm lại.
      toast.error(err.response?.data?.error?.message || 'Chưa tạo lại được liên kết thanh toán — vui lòng thử lại');
    } finally {
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

      {!loading && items.length > 0 && (
        <FilterBar
          active={filterActive}
          onReset={() => setFilters(emptyFilters)}
          shown={visibleItems.length}
          total={items.length}
          unitLabel="vé"
          gridClassName="sm:grid-cols-2 lg:grid-cols-4"
        >
          <SearchField
            label="Biển số"
            value={filters.plate}
            onChange={(v) => setFilter('plate', v)}
            placeholder="VD: 51F-678.90"
          />
          <SelectField
            label="Trạng thái"
            value={filters.status}
            onChange={(v) => setFilter('status', v)}
            allLabel="— Tất cả trạng thái —"
            options={STATUS_OPTIONS}
          />
          <SelectField
            label="Tầng"
            value={filters.floorId}
            onChange={(v) => setFilter('floorId', v)}
            allLabel="— Tất cả tầng —"
            options={floorOptions}
          />
          <SelectField
            label="Lọc ngày theo"
            value={filters.dateField}
            onChange={(v) => setFilter('dateField', v)}
            options={DATE_FIELD_OPTIONS}
          />
          <DateRangeField
            label="Khoảng ngày"
            from={filters.from}
            to={filters.to}
            onFromChange={(v) => setFilter('from', v)}
            onToChange={(v) => setFilter('to', v)}
            className="sm:col-span-2"
          />
        </FilterBar>
      )}

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
      ) : visibleItems.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Không có vé nào khớp bộ lọc"
          description="Thử nới khoảng ngày hoặc bỏ bớt điều kiện lọc"
          action={<Button variant="secondary" onClick={() => setFilters(emptyFilters)}>Xóa lọc</Button>}
        />
      ) : (
        <div className="space-y-3">
          {visibleItems.map((pass) => {
            const showQr =
              pass.status === 'active' &&
              pass.qr_token &&
              !String(pass.qr_token).startsWith('revoked-');
            const cancellable = pass.status === 'pending' || pass.status === 'active';
            const showCancelInfo = pass.status === 'cancelled';
            const cancelledPaid = showCancelInfo ? paidPaymentOf(pass) : null;
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
                      {formatFloorLabel(pass.floor?.label || pass.floor?.floor_code) || '—'}
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
                  </div>
                </div>

                {/* Vé đã hủy: trước đây chỉ có chữ "Vé đã hủy" nên khách không biết hủy lúc nào
                    và đã trả bao nhiêu. Số tiền hoàn CỐ TÌNH không hiện — % hoàn do BE tính
                    (computePassRefundPercent), tính lại ở FE là lệch cấu hình, hiện sai cho khách. */}
                {showCancelInfo && (
                  <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm">
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-slate-600">
                      {/* Bảng vé chưa có cột cancelled_at — updated_at chính là lần đổi cuối,
                          tức lúc hủy (đã báo BE). */}
                      <span>Thời điểm hủy: <strong className="text-slate-700">{fmtDateTime(pass.updated_at)}</strong></span>
                      {cancelledPaid && (
                        <span>Đã thanh toán: <strong className="text-slate-700">{fmtMoney(cancelledPaid.amount)}</strong></span>
                      )}
                    </div>
                    {cancelledPaid ? (
                      <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-700">
                        Vui lòng đợi bộ phận hoàn tiền xử lý. Nhớ cập nhật số tài khoản ngân hàng
                        trong hồ sơ để nhận tiền hoàn.
                      </p>
                    ) : (
                      <p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-500">
                        Vé chưa thanh toán nên không phát sinh hoàn tiền.
                      </p>
                    )}
                  </div>
                )}

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
            {refundPolicy ? (
              // Các mốc đọc từ settings pass_refund_* — khớp trang Cấu hình hệ thống của Manager.
              <ul className="space-y-1 rounded-lg bg-slate-50 px-4 py-3 text-slate-600">
                <li>· Trước ngày hiệu lực: <strong>hoàn 100%</strong></li>
                {Number(refundPolicy.trialDays) > 0 && (
                  <li>· {Number(refundPolicy.trialDays)} ngày đầu hiệu lực: <strong>{refundPctLabel(refundPolicy.trialPercent)}</strong></li>
                )}
                <li>· Tới hết nửa thời hạn: <strong>{refundPctLabel(refundPolicy.halfTermPercent)}</strong></li>
                <li>· Quá nửa thời hạn: <strong>không hoàn</strong></li>
              </ul>
            ) : (
              // Chưa đọc được chính sách (BE chưa có endpoint) — không bịa số cứng kẻo sai với cấu hình.
              <p className="rounded-lg bg-slate-50 px-4 py-3 text-slate-600">
                Mức hoàn tính theo chính sách hoàn tiền hiện hành của bãi xe.
              </p>
            )}
            <p className="text-xs text-slate-400">
              Nếu có tiền hoàn, hệ thống tạo yêu cầu hoàn tiền — bạn cần cập nhật số tài khoản ngân hàng
              trong hồ sơ{refundPolicy && Number(refundPolicy.bankInfoTtlDays) > 0
                ? ` trong vòng ${Number(refundPolicy.bankInfoTtlDays)} ngày`
                : ''} để nhận tiền. Số tiền hoàn chính xác hiển thị sau khi xác nhận hủy.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
