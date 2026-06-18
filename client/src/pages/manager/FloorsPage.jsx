import { useEffect, useState } from 'react';
import { floorsApi } from '../../api/masterData';
import { validateFloorForm } from '../../lib/validate';
import Modal from '../../components/ui/Modal';
import Field, { ErrorAlert } from '../../components/ui/Field';
import { inputClass } from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { toast } from '../../components/ui/toast';

export default function FloorsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ floorCode: '', floorLevel: '', label: '' });

  // Tải danh sách tầng từ backend.
  const load = async () => {
    setLoading(true);
    try {
      const { data } = await floorsApi.list();
      setItems(data.data);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Không tải được danh sách tầng');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Tải danh sách một lần khi mở trang.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ floorCode: '', floorLevel: '', label: '' });
    setFieldErrors({});
    setError('');
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({ floorCode: item.floor_code, floorLevel: String(item.floor_level), label: item.label });
    setFieldErrors({});
    setError('');
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validateFloorForm(form); // validate phía client trước
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setError('');
    setSubmitting(true);
    try {
      const payload = {
        floorCode: form.floorCode.trim(),
        floorLevel: Number(form.floorLevel),
        label: form.label.trim(),
      };
      if (editing) await floorsApi.update(editing.floor_id, payload);
      else await floorsApi.create(payload);
      toast.success(editing ? 'Đã cập nhật tầng' : 'Đã thêm tầng');
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Lưu thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Xóa tầng "${item.floor_code}"?`)) return;
    try {
      await floorsApi.remove(item.floor_id);
      toast.success('Đã xóa tầng');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Xóa thất bại');
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tầng / Tầng hầm</h1>
          <p className="mt-1 text-sm text-slate-500">Quản lý mã tầng, cấp và nhãn hiển thị</p>
        </div>
        <Button onClick={openCreate} className="brand-gradient border-0 shadow-(--shadow-soft)">
          + Thêm tầng
        </Button>
      </div>

      {error && !modalOpen && <ErrorAlert message={error} className="mb-4" />}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-surface-raised shadow-(--shadow-card)">
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Mã tầng</th>
              <th className="px-4 py-3 font-medium">Cấp</th>
              <th className="px-4 py-3 font-medium">Tên hiển thị</th>
              <th className="px-4 py-3 text-right font-medium">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">Đang tải...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">Chưa có tầng nào</td></tr>
            ) : (
              items.map((item) => (
                <tr key={item.floor_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-brand-light px-2 py-0.5 font-mono text-xs text-brand">
                      {item.floor_code}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.floor_level}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{item.label}</td>
                  <td className="space-x-3 px-4 py-3 text-right">
                    <button type="button" onClick={() => openEdit(item)} className="font-medium text-brand hover:underline">
                      Sửa
                    </button>
                    <button type="button" onClick={() => handleDelete(item)} className="font-medium text-red-600 hover:underline">
                      Xóa
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={modalOpen}
        title={editing ? 'Sửa tầng' : 'Thêm tầng'}
        onClose={() => setModalOpen(false)}
      >
        <ErrorAlert message={error} className="mb-4" />
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Mã tầng" required error={fieldErrors.floorCode}>
            <input className={inputClass} value={form.floorCode} onChange={(e) => setForm({ ...form, floorCode: e.target.value })} placeholder="B1" required />
          </Field>
          <Field label="Cấp tầng (số)" required error={fieldErrors.floorLevel} hint="Tầng hầm dùng số âm: B2 → -2">
            <input type="number" className={inputClass} value={form.floorLevel} onChange={(e) => setForm({ ...form, floorLevel: e.target.value })} placeholder="-1" required />
          </Field>
          <Field label="Tên hiển thị" required error={fieldErrors.label}>
            <input className={inputClass} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Hầm B1" required />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" className="brand-gradient border-0" loading={submitting}>
              Lưu
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
