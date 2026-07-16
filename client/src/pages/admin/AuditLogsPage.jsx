import { useEffect, useState } from 'react';
import { auditApi } from '../../api/admin';
import { ErrorAlert } from '../../components/ui/Field';
import { inputClass } from '../../components/ui/Input';
import Button from '../../components/ui/Button';

// Nhật ký hệ thống (Module A2) — trang CHỈ XEM: bảng lịch sử thao tác Admin/Manager + lọc + phân trang.
// Nguồn dữ liệu: GET /admin/audit-logs (Admin-only). Không có CRUD, không mutation.

const emptyFilters = { action: '', actorId: '', from: '', to: '' };

// Nhãn hành động thân thiện (thay mã kỹ thuật user.create...).
const ACTION_LABEL = {
  'user.create': 'Tạo tài khoản',
  'user.update': 'Cập nhật tài khoản',
  RESERVATION_REFUND_OWED: 'Ghi nợ hoàn tiền đặt chỗ',
};
const actionText = (a) => ACTION_LABEL[a] || a;

// Danh sách hành động cho ô lọc (dropdown thay vì gõ mã).
const ACTION_OPTIONS = [
  ['', 'Tất cả hành động'],
  ['user.create', 'Tạo tài khoản'],
  ['user.update', 'Cập nhật tài khoản'],
  ['RESERVATION_REFUND_OWED', 'Ghi nợ hoàn tiền đặt chỗ'],
];

// Nhãn tiếng Việt cho tên trường DB (dùng mô tả "cập nhật những gì").
const FIELD_LABEL = {
  is_active: 'trạng thái hoạt động',
  role_id: 'vai trò',
  full_name: 'họ tên',
  email: 'email',
  phone: 'số điện thoại',
};

// Mô tả chi tiết thân thiện từ JSON BE lưu — thay cho "targetUserId=5, fields=[...]".
const describe = (action, raw) => {
  let d;
  try { d = raw ? JSON.parse(raw) : {}; } catch { return String(raw || '—'); }
  const who = d.targetUsername || d.username || (d.targetUserId ? `#${d.targetUserId}` : '—');
  if (action === 'user.create') {
    return `Tạo tài khoản "${who}" — vai trò ${d.role || '—'}`;
  }
  if (action === 'user.update') {
    // Ưu tiên diễn đạt khóa/mở nếu chỉ đổi trạng thái.
    if (d.isActive !== undefined && (d.fields || []).length === 1 && d.fields[0] === 'is_active' && !d.passwordChanged) {
      return `${d.isActive ? 'Mở khóa' : 'Khóa'} tài khoản "${who}"`;
    }
    const parts = (d.fields || []).map((f) => FIELD_LABEL[f] || f);
    if (d.passwordChanged) parts.push('mật khẩu');
    return `Cập nhật "${who}": ${parts.length ? parts.join(', ') : '—'}`;
  }
  // Fallback: hiện gọn key=value.
  const s = Object.entries(d).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ');
  return s || '—';
};

export default function AuditLogsPage() {
  const [filters, setFilters] = useState(emptyFilters); // ô nhập (draft)
  const [data, setData] = useState({ items: [], total: 0, page: 1, limit: 50, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Tải nhật ký theo bộ lọc + trang chỉ định. Nhận f để reset gọi được với bộ lọc rỗng
  // ngay lập tức (tránh đọc state filters chưa kịp cập nhật). Chỉ gửi field có giá trị.
  const load = async (page = 1, f = filters) => {
    setLoading(true);
    setError('');
    try {
      const params = { page };
      if (f.action.trim()) params.action = f.action.trim();
      if (f.actorId) params.actorId = f.actorId;
      if (f.from) params.from = f.from;
      if (f.to) params.to = f.to;
      const { data: res } = await auditApi.list(params);
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Không tải được nhật ký hệ thống');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Tải lần đầu khi mở trang (chỉ chạy 1 lần — bộ lọc áp dụng qua nút "Lọc").
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyFilters = (e) => {
    e.preventDefault();
    load(1); // lọc -> luôn về trang 1
  };

  const resetFilters = () => {
    setFilters(emptyFilters);
    load(1, emptyFilters); // dùng bộ lọc rỗng ngay, không chờ state cập nhật
  };

  const { items, page, pages, total } = data;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Nhật ký hệ thống</h1>
          <p className="mt-1 text-sm text-slate-500">Lịch sử thao tác nhạy cảm của Admin / Manager (chỉ xem)</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => load(page)} loading={loading}>Làm mới</Button>
      </div>

      {error && <ErrorAlert message={error} className="mb-4" />}

      {/* Bộ lọc */}
      <form onSubmit={applyFilters} className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600">Hành động</span>
          <select
            className={inputClass}
            value={filters.action}
            onChange={(e) => setFilters({ ...filters, action: e.target.value })}
          >
            {ACTION_OPTIONS.map(([v, label]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600">Người thực hiện (ID)</span>
          <input
            type="number"
            min="1"
            className={inputClass}
            value={filters.actorId}
            onChange={(e) => setFilters({ ...filters, actorId: e.target.value })}
            placeholder="vd: 1"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600">Từ ngày</span>
          <input type="date" className={inputClass} value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600">Đến ngày</span>
          <input type="date" className={inputClass} value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        </label>
        <div className="flex gap-2">
          <Button type="submit" className="brand-gradient border-0" loading={loading}>Lọc</Button>
          <Button type="button" variant="secondary" onClick={resetFilters}>Xóa lọc</Button>
        </div>
      </form>
      <p className="mb-2 text-xs text-slate-400">Lọc theo ngày cần điền cả "Từ ngày" và "Đến ngày".</p>

      {/* Bảng nhật ký */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-surface-raised shadow-(--shadow-card)">
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium whitespace-nowrap">Thời gian</th>
              <th className="px-4 py-3 font-medium">Người thực hiện</th>
              <th className="px-4 py-3 font-medium">Hành động</th>
              <th className="px-4 py-3 font-medium">Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">Đang tải...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">Không có bản ghi nào khớp bộ lọc</td></tr>
            ) : (
              items.map((log) => (
                <tr key={log.log_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                    {log.created_at ? new Date(log.created_at).toLocaleString('vi-VN') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-800">{log.actor?.full_name || log.actor?.username || '—'}</span>
                    <span className="ml-1 text-xs text-slate-400">#{log.actor_id}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-brand-light px-2 py-0.5 text-xs font-medium text-brand">{actionText(log.action)}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <span className="block max-w-md truncate text-xs" title={describe(log.action, log.details)}>
                      {describe(log.action, log.details)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Phân trang */}
      <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
        <span>{total > 0 ? `Trang ${page}/${pages} · ${total} bản ghi` : 'Không có bản ghi'}</span>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => load(page - 1)} disabled={loading || page <= 1}>← Trước</Button>
          <Button variant="secondary" size="sm" onClick={() => load(page + 1)} disabled={loading || page >= pages}>Sau →</Button>
        </div>
      </div>
    </div>
  );
}
