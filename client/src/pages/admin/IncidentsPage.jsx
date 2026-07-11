import { useEffect, useState } from 'react';
import { incidentsApi } from '../../api/incidents';
import { ErrorAlert } from '../../components/ui/Field';
import { inputClass } from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { toast } from '../../components/ui/toast';

// Quản lý sự cố (UC-09) — Admin xem TẤT CẢ sự cố + lọc + đổi trạng thái.
// Nguồn: GET /incidents (Admin thấy tất cả) + PATCH /incidents/:id/status.

// Mirror nhãn server (INCIDENT_TYPE_LABELS) cho dropdown lọc loại.
const TYPE_OPTIONS = [
  ['wrong_floor', 'Sai tầng'],
  ['duplicate_session', 'Trùng phiên'],
  ['window_violation', 'Vi phạm khung giờ'],
  ['slot_conflict', 'Xung đột slot'],
  ['lost_ticket', 'Mất thẻ'],
  ['wrong_info', 'Sai thông tin xe'],
  ['overstay', 'Quá hạn gửi'],
  ['wrong_zone', 'Sai khu vực'],
  ['feedback', 'Phản hồi khách'],
  ['other', 'Khác'],
];
const STATUS_OPTIONS = [
  ['open', 'Mới'],
  ['investigating', 'Đang xử lý'],
  ['resolved', 'Đã xử lý'],
];
const STATUS_BADGE = {
  open: 'bg-amber-50 text-amber-700',
  investigating: 'bg-blue-50 text-blue-700',
  resolved: 'bg-emerald-50 text-emerald-700',
};

const emptyFilters = { status: '', type: '' };

export default function IncidentsPage() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, limit: 50, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(emptyFilters);
  const [updatingId, setUpdatingId] = useState(null);

  const load = async (page = 1, f = filters) => {
    setLoading(true);
    setError('');
    try {
      const params = { page };
      if (f.status) params.status = f.status;
      if (f.type) params.type = f.type;
      const { data: res } = await incidentsApi.list(params);
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Không tải được danh sách sự cố');
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

  const applyFilter = (next) => {
    setFilters(next);
    load(1, next);
  };

  const changeStatus = async (inc, status) => {
    if (status === inc.status) return;
    setUpdatingId(inc.incident_id);
    try {
      await incidentsApi.updateStatus(inc.incident_id, status);
      toast.success('Đã cập nhật trạng thái sự cố');
      load(data.page);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Cập nhật trạng thái thất bại');
    } finally {
      setUpdatingId(null);
    }
  };

  const { items, page, pages, total } = data;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Quản lý sự cố</h1>
          <p className="mt-1 text-sm text-slate-500">Xem sự cố nhân viên báo & cập nhật trạng thái xử lý</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => load(page)} loading={loading}>Làm mới</Button>
      </div>

      {error && <ErrorAlert message={error} className="mb-4" />}

      {/* Bộ lọc */}
      <div className="mb-4 flex flex-wrap gap-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600">Trạng thái</span>
          <select className={inputClass} value={filters.status} onChange={(e) => applyFilter({ ...filters, status: e.target.value })}>
            <option value="">— Tất cả —</option>
            {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600">Loại sự cố</span>
          <select className={inputClass} value={filters.type} onChange={(e) => applyFilter({ ...filters, type: e.target.value })}>
            <option value="">— Tất cả —</option>
            {TYPE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      </div>

      {/* Bảng sự cố */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-surface-raised shadow-(--shadow-card)">
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium whitespace-nowrap">Thời gian</th>
              <th className="px-4 py-3 font-medium">Loại</th>
              <th className="px-4 py-3 font-medium">Mô tả</th>
              <th className="px-4 py-3 font-medium">Người báo</th>
              <th className="px-4 py-3 font-medium">Liên quan</th>
              <th className="px-4 py-3 font-medium">Trạng thái</th>
              <th className="px-4 py-3 font-medium">Người xử lý</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Đang tải...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Không có sự cố nào khớp bộ lọc</td></tr>
            ) : (
              items.map((inc) => (
                <tr key={inc.incident_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">{inc.created_at ? new Date(inc.created_at).toLocaleString('vi-VN') : '—'}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{inc.typeLabel}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600"><span className="block max-w-xs truncate" title={inc.description}>{inc.description}</span></td>
                  <td className="px-4 py-3 text-slate-600">{inc.reporter?.full_name || inc.reporter?.username || <span className="text-slate-400">Hệ thống</span>}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {inc.session?.plate_number ? <span className="font-mono text-xs">{inc.session.plate_number}</span> : null}
                    {inc.slot?.slot_code ? <span className="ml-1 text-xs text-slate-400">· {inc.slot.slot_code}</span> : null}
                    {!inc.session?.plate_number && !inc.slot?.slot_code ? <span className="text-slate-400">—</span> : null}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className={`rounded-lg border-0 px-2 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand/40 ${STATUS_BADGE[inc.status] || 'bg-slate-100 text-slate-600'}`}
                      value={inc.status}
                      disabled={updatingId === inc.incident_id}
                      onChange={(e) => changeStatus(inc, e.target.value)}
                    >
                      {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {inc.status === 'resolved' && inc.resolver ? (
                      <div>
                        <span>{inc.resolver.full_name || inc.resolver.username}</span>
                        {inc.resolved_at && <span className="block text-xs text-slate-400">{new Date(inc.resolved_at).toLocaleString('vi-VN')}</span>}
                      </div>
                    ) : <span className="text-slate-400">—</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Phân trang */}
      <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
        <span>{total > 0 ? `Trang ${page}/${pages} · ${total} sự cố` : 'Không có sự cố'}</span>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => load(page - 1)} disabled={loading || page <= 1}>← Trước</Button>
          <Button variant="secondary" size="sm" onClick={() => load(page + 1)} disabled={loading || page >= pages}>Sau →</Button>
        </div>
      </div>
    </div>
  );
}
