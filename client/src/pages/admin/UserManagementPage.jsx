import { useEffect, useState } from 'react';
import { usersApi } from '../../api/admin';
import { useAuth } from '../../context/AuthContext';
import { roleLabels } from '../../lib/auth';
import Modal from '../../components/ui/Modal';
import Field, { ErrorAlert } from '../../components/ui/Field';
import { inputClass } from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { toast } from '../../components/ui/toast';

// Quản lý người dùng (Module A1) — danh sách tài khoản + tạo / sửa / khóa-mở / đổi vai trò.
// Nguồn: GET/POST/PATCH /admin/users, GET /admin/users/roles (Admin-only).

const emptyForm = { username: '', password: '', fullName: '', email: '', phone: '', roleId: '' };

export default function UserManagementPage() {
  const { user: me } = useAuth();
  const myId = me?.userId;

  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  // Modal tạo/sửa
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState('create'); // 'create' | 'edit'
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState(null); // id đang khóa/mở

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await usersApi.list();
      setUsers(data.data || []);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Không tải được danh sách người dùng');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Tải danh sách user + vai trò một lần khi mở trang.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    usersApi
      .listRoles()
      .then(({ data }) => setRoles(data.data || []))
      .catch(() => setRoles([]));
  }, []);

  const roleText = (roleName) => roleLabels[roleName] || roleName || '—';

  const openCreate = () => {
    setMode('create');
    setEditingId(null);
    setForm(emptyForm);
    setFieldErrors({});
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (u) => {
    setMode('edit');
    setEditingId(u.user_id);
    setForm({
      username: u.username,
      password: '',
      fullName: u.full_name || '',
      email: u.email || '',
      phone: u.phone || '',
      roleId: String(u.role_id),
    });
    setFieldErrors({});
    setFormError('');
    setModalOpen(true);
  };

  const validate = () => {
    const e = {};
    if (mode === 'create') {
      if (form.username.trim().length < 3) e.username = 'Tối thiểu 3 ký tự';
      if (form.password.length < 6) e.password = 'Tối thiểu 6 ký tự';
    } else if (form.password && form.password.length < 6) {
      e.password = 'Tối thiểu 6 ký tự';
    }
    if (!form.fullName.trim()) e.fullName = 'Bắt buộc';
    if (!form.roleId) e.roleId = 'Chọn vai trò';
    if (form.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) e.email = 'Email không hợp lệ';
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setFormError('');
    setSubmitting(true);
    try {
      if (mode === 'create') {
        await usersApi.create({
          username: form.username.trim(),
          password: form.password,
          fullName: form.fullName.trim(),
          roleId: Number(form.roleId),
          ...(form.email.trim() ? { email: form.email.trim() } : {}),
          ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
        });
        toast.success('Đã tạo người dùng');
      } else {
        await usersApi.update(editingId, {
          fullName: form.fullName.trim(),
          email: form.email.trim(), // rỗng -> BE chuyển thành null
          phone: form.phone.trim(),
          roleId: Number(form.roleId),
          ...(form.password ? { password: form.password } : {}), // chỉ gửi khi đổi mật khẩu
        });
        toast.success('Đã cập nhật người dùng');
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setFormError(err.response?.data?.error?.message || 'Lưu thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (u) => {
    setTogglingId(u.user_id);
    try {
      await usersApi.update(u.user_id, { isActive: !u.is_active });
      toast.success(u.is_active ? 'Đã khóa tài khoản' : 'Đã mở khóa tài khoản');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Thao tác thất bại');
    } finally {
      setTogglingId(null);
    }
  };

  const filtered = users.filter((u) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [u.username, u.full_name, u.email].some((v) => (v || '').toLowerCase().includes(q));
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Quản lý người dùng</h1>
          <p className="mt-1 text-sm text-slate-500">Tạo tài khoản, khóa/mở và đổi vai trò</p>
        </div>
        <Button onClick={openCreate} className="brand-gradient border-0 shadow-(--shadow-soft)">
          + Tạo người dùng
        </Button>
      </div>

      {error && <ErrorAlert message={error} className="mb-4" />}

      <input
        className={`${inputClass} mb-4 sm:max-w-xs`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Tìm theo tên đăng nhập / họ tên / email..."
      />

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-surface-raised shadow-(--shadow-card)">
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Tên đăng nhập</th>
              <th className="px-4 py-3 font-medium">Họ tên</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Vai trò</th>
              <th className="px-4 py-3 font-medium">Trạng thái</th>
              <th className="px-4 py-3 text-right font-medium">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Đang tải...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Không có người dùng nào</td></tr>
            ) : (
              filtered.map((u) => {
                const isSelf = myId && u.user_id === myId;
                return (
                  <tr key={u.user_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-mono font-medium text-slate-800">
                      {u.username}
                      {isSelf && <span className="ml-2 rounded bg-brand-light px-1.5 py-0.5 text-xs text-brand">bạn</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{u.full_name || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{u.email || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {roleText(u.role?.role_name)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {u.is_active ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">● Đang hoạt động</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">● Đã khóa</span>
                      )}
                    </td>
                    <td className="space-x-3 px-4 py-3 text-right whitespace-nowrap">
                      <button type="button" onClick={() => openEdit(u)} className="font-medium text-brand hover:underline">
                        Sửa
                      </button>
                      {isSelf ? (
                        <span className="text-slate-300" title="Không thể tự khóa tài khoản của mình">Khóa</span>
                      ) : u.is_active ? (
                        <button type="button" disabled={togglingId === u.user_id} onClick={() => toggleActive(u)} className="font-medium text-red-600 hover:underline disabled:opacity-50">
                          Khóa
                        </button>
                      ) : (
                        <button type="button" disabled={togglingId === u.user_id} onClick={() => toggleActive(u)} className="font-medium text-emerald-600 hover:underline disabled:opacity-50">
                          Mở khóa
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

      <Modal
        open={modalOpen}
        title={mode === 'create' ? 'Tạo người dùng' : `Sửa người dùng — ${form.username}`}
        onClose={() => setModalOpen(false)}
      >
        <ErrorAlert message={formError} className="mb-4" />
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'create' && (
            <Field label="Tên đăng nhập" required error={fieldErrors.username} hint="Tối thiểu 3 ký tự">
              <input className={inputClass} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
            </Field>
          )}
          <Field label="Họ tên" required error={fieldErrors.fullName}>
            <input className={inputClass} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
          </Field>
          <Field label="Email" error={fieldErrors.email} hint="Tùy chọn">
            <input type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="a@gmail.com" />
          </Field>
          <Field label="Số điện thoại" hint="Tùy chọn">
            <input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Vai trò" required error={fieldErrors.roleId}>
            <select
              className={inputClass}
              value={form.roleId}
              onChange={(e) => setForm({ ...form, roleId: e.target.value })}
              disabled={mode === 'edit' && editingId === myId}
              required
            >
              <option value="">— Chọn vai trò —</option>
              {roles.map((r) => (
                <option key={r.role_id} value={r.role_id}>{roleText(r.role_name)}</option>
              ))}
            </select>
            {mode === 'edit' && editingId === myId && (
              <p className="mt-1 text-xs text-slate-400">Không thể tự đổi vai trò của mình.</p>
            )}
          </Field>
          <Field
            label={mode === 'create' ? 'Mật khẩu' : 'Mật khẩu mới'}
            required={mode === 'create'}
            error={fieldErrors.password}
            hint={mode === 'create' ? 'Tối thiểu 6 ký tự' : 'Để trống nếu không đổi'}
          >
            <input type="password" className={inputClass} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={mode === 'create'} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="submit" className="brand-gradient border-0" loading={submitting}>Lưu</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
