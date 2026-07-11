import { useEffect, useState } from 'react';
import { refundApi } from '../../api/refund';
import Modal from '../../components/ui/Modal';
import { ErrorAlert } from '../../components/ui/Field';
import { inputClass } from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { toast } from '../../components/ui/toast';

// Hoàn tiền hủy vé tháng (P3-8) — Admin xem yêu cầu + nhắc user nhập STK + đánh dấu đã chuyển khoản.
// Nguồn: GET /refunds (Admin) · POST /refunds/:id/remind · POST /refunds/:id/complete.
// Hoàn tiền là THỦ CÔNG: Admin chuyển khoản tay ngoài hệ thống rồi bấm "Đã chuyển khoản".

const STATUS_OPTIONS = [
  ['pending', 'Chờ xử lý'],
  ['refunded', 'Đã hoàn'],
  ['expired', 'Hết hạn'],
];
const STATUS_BADGE = {
  pending: 'bg-amber-50 text-amber-700',
  refunded: 'bg-emerald-50 text-emerald-700',
  expired: 'bg-slate-100 text-slate-500',
};
const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS);

const fmtMoney = (v) => `${Number(v || 0).toLocaleString('vi-VN')} ₫`;
const fmtDateTime = (v) => (v ? new Date(v).toLocaleString('vi-VN') : '—');
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('vi-VN') : '—');

// Loại nguồn hoàn (migration 006): vé tháng hay đặt chỗ. BE trả field `type`.
const TYPE_META = {
  monthly_pass: ['Vé tháng', 'bg-indigo-50 text-indigo-700'],
  booking: ['Đặt chỗ', 'bg-sky-50 text-sky-700'],
};

// Refund tham chiếu 1 trong 2: pass (vé tháng, hạn theo ngày) HOẶC reservation (đặt chỗ, khung giờ).
// Gộp về chung { plate, range } để render cột — reservation dùng datetime, pass dùng date.
const refundSource = (r) => {
  if (r.type === 'booking' && r.reservation) {
    return {
      plate: r.reservation.plate_number,
      range: `${fmtDateTime(r.reservation.start_time)} → ${fmtDateTime(r.reservation.end_time)}`,
    };
  }
  return {
    plate: r.pass?.plate_number,
    range: `${fmtDate(r.pass?.start_date)} → ${fmtDate(r.pass?.end_date)}`,
  };
};

export default function RefundsPage() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, limit: 50, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [remindingId, setRemindingId] = useState(null);

  // Modal "Đã chuyển khoản"
  const [completeTarget, setCompleteTarget] = useState(null); // refund đang xác nhận (null = đóng)
  const [note, setNote] = useState('');
  const [completing, setCompleting] = useState(false);

  const load = async (page = 1, status = statusFilter) => {
    setLoading(true);
    setError('');
    try {
      const params = { page };
      if (status) params.status = status;
      const { data: res } = await refundApi.list(params);
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Không tải được danh sách hoàn tiền');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Tải lần đầu khi mở trang (chỉ chạy 1 lần — bộ lọc áp dụng qua dropdown).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyFilter = (status) => {
    setStatusFilter(status);
    load(1, status);
  };

  const handleRemind = async (refund) => {
    setRemindingId(refund.refund_id);
    try {
      const { data: res } = await refundApi.remind(refund.refund_id);
      toast.success(res.message || 'Đã gửi email nhắc cập nhật tài khoản ngân hàng');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Gửi email nhắc thất bại');
    } finally {
      setRemindingId(null);
    }
  };

  const openComplete = (refund) => {
    setCompleteTarget(refund);
    setNote('');
  };

  const handleComplete = async () => {
    if (!completeTarget || completing) return;
    setCompleting(true);
    try {
      await refundApi.complete(completeTarget.refund_id, note.trim());
      toast.success('Đã đánh dấu hoàn tiền thành công');
      setCompleteTarget(null);
      load(data.page);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Đánh dấu hoàn tiền thất bại');
    } finally {
      setCompleting(false);
    }
  };

  const { items, page, pages, total } = data;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Hoàn tiền</h1>
          <p className="mt-1 text-sm text-slate-500">
            Yêu cầu hoàn tiền khi khách hủy vé tháng hoặc đặt chỗ — nhắc khách nhập STK & đánh dấu đã chuyển khoản (thủ công)
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => load(page)} loading={loading}>Làm mới</Button>
      </div>

      {error && <ErrorAlert message={error} className="mb-4" />}

      {/* Bộ lọc trạng thái */}
      <div className="mb-4 flex flex-wrap gap-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600">Trạng thái</span>
          <select className={inputClass} value={statusFilter} onChange={(e) => applyFilter(e.target.value)}>
            <option value="">— Tất cả —</option>
            {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      </div>

      {/* Bảng yêu cầu hoàn tiền */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-surface-raised shadow-(--shadow-card)">
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium whitespace-nowrap">Yêu cầu lúc</th>
              <th className="px-4 py-3 font-medium">Khách</th>
              <th className="px-4 py-3 font-medium">Nguồn hoàn (biển số · hạn)</th>
              <th className="px-4 py-3 font-medium">Hoàn</th>
              <th className="px-4 py-3 font-medium">Tài khoản NH</th>
              <th className="px-4 py-3 font-medium">Trạng thái</th>
              <th className="px-4 py-3 text-right font-medium">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Đang tải...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Không có yêu cầu hoàn tiền nào khớp bộ lọc</td></tr>
            ) : (
              items.map((r) => {
                const src = refundSource(r);
                const [typeLabel, typeBadge] = TYPE_META[r.type] || ['Khác', 'bg-slate-100 text-slate-600'];
                return (
                <tr key={r.refund_id} className="border-b border-slate-100 last:border-0 align-top hover:bg-slate-50/60">
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">{fmtDateTime(r.requested_at)}</td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-800">{r.user?.full_name || r.user?.username || '—'}</span>
                    <span className="block text-xs text-slate-400">{r.user?.phone || r.user?.email || ''}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <span className={`mb-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${typeBadge}`}>{typeLabel}</span>
                    <span className="block font-mono">{src.plate || '—'}</span>
                    <span className="block text-xs text-slate-400">{src.range}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-brand">{fmtMoney(r.amount)}</span>
                    <span className="block text-xs text-slate-400">{r.percent}% của {fmtMoney(r.payment?.amount)}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {r.bankInfoReady ? (
                      <span>
                        <span className="font-medium">{r.user?.bank_name || 'NH'}</span> · {r.user?.bank_account_number}
                        <span className="block text-xs text-slate-400">{r.user?.bank_account_holder || ''}</span>
                      </span>
                    ) : (
                      <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Chưa có STK</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status] || 'bg-slate-100 text-slate-600'}`}>
                      {STATUS_LABEL[r.status] || r.status}
                    </span>
                    {r.status === 'refunded' && (
                      <span className="mt-1 block text-xs text-slate-400" title={r.note || ''}>
                        {fmtDateTime(r.refunded_at)}{r.refundedBy?.full_name ? ` · ${r.refundedBy.full_name}` : ''}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {r.status !== 'pending' ? (
                      <span className="text-slate-300">—</span>
                    ) : r.bankInfoReady ? (
                      <button type="button" onClick={() => openComplete(r)} className="font-medium text-emerald-600 hover:underline">
                        Đã chuyển khoản
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={remindingId === r.refund_id}
                        onClick={() => handleRemind(r)}
                        className="font-medium text-brand hover:underline disabled:opacity-50"
                      >
                        Nhắc nhập STK
                      </button>
                    )}
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Phân trang */}
      <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
        <span>{total > 0 ? `Trang ${page}/${pages} · ${total} yêu cầu` : 'Không có yêu cầu'}</span>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => load(page - 1)} disabled={loading || page <= 1}>← Trước</Button>
          <Button variant="secondary" size="sm" onClick={() => load(page + 1)} disabled={loading || page >= pages}>Sau →</Button>
        </div>
      </div>

      {/* Modal xác nhận đã chuyển khoản */}
      <Modal
        open={!!completeTarget}
        title="Xác nhận đã chuyển khoản hoàn tiền"
        onClose={() => !completing && setCompleteTarget(null)}
      >
        {completeTarget && (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Khách</span><span className="font-medium">{completeTarget.user?.full_name || completeTarget.user?.username}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Số tiền hoàn</span><span className="font-semibold text-brand">{fmtMoney(completeTarget.amount)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Ngân hàng</span><span>{completeTarget.user?.bank_name || 'NH'} · {completeTarget.user?.bank_account_number}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Chủ TK</span><span>{completeTarget.user?.bank_account_holder || '—'}</span></div>
            </div>
            <p className="text-sm text-slate-600">
              Chỉ bấm sau khi bạn <strong>đã chuyển khoản tay</strong> số tiền trên. Thao tác này đánh dấu yêu cầu là “đã hoàn” và không hoàn tác được.
            </p>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">Ghi chú (mã giao dịch CK — tùy chọn)</span>
              <input
                className={inputClass}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={255}
                placeholder="VD: CK Vietcombank 06/07 mã GD 12345"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setCompleteTarget(null)} disabled={completing}>Hủy</Button>
              <Button type="button" className="brand-gradient border-0" loading={completing} onClick={handleComplete}>
                Xác nhận đã hoàn
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
