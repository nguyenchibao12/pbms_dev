import { useEffect, useState } from 'react';
import { vehicleTypesApi } from '../../api/masterData';
import { validateVehicleTypeForm } from '../../lib/validate';
import Modal from '../../components/ui/Modal';
import Field, { ErrorAlert } from '../../components/ui/Field';
import { inputClass } from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { toast } from '../../components/ui/toast';

export default function VehicleTypesPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ typeName: '', typeCode: '', slotAreaM2: '' });

  // Tải danh sách loại xe từ backend.
  const load = async () => {
    setLoading(true);
    try {
      const { data } = await vehicleTypesApi.list();
      setItems(data.data);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Không tải được loại xe');
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
    setForm({ typeName: '', typeCode: '', slotAreaM2: '' });
    setFieldErrors({});
    setError('');
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      typeName: item.type_name,
      typeCode: item.type_code,
      slotAreaM2: item.slot_area_m2 != null ? String(item.slot_area_m2) : '',
    });
    setFieldErrors({});
    setError('');
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validateVehicleTypeForm(form); // validate phía client trước
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setError('');
    setSubmitting(true);
    try {
      const payload = {
        typeName: form.typeName.trim(),
        typeCode: form.typeCode.trim().toUpperCase(),
        slotAreaM2: form.slotAreaM2 === '' ? 0 : Number(form.slotAreaM2),
      };
      if (editing) await vehicleTypesApi.update(editing.vehicle_type_id, payload);
      else await vehicleTypesApi.create(payload);
      toast.success(editing ? 'Đã cập nhật loại xe' : 'Đã thêm loại xe');
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Lưu thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Xóa loại xe "${item.type_name}"?`)) return;
    try {
      await vehicleTypesApi.remove(item.vehicle_type_id);
      toast.success('Đã xóa loại xe');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Xóa thất bại');
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Loại xe</h1>
          <p className="mt-1 text-sm text-slate-500">Quản lý các loại phương tiện: ô tô, xe máy, SUV…</p>
        </div>
        <Button onClick={openCreate} className="brand-gradient border-0 shadow-(--shadow-soft)">
          + Thêm loại xe
        </Button>
      </div>

      {error && !modalOpen && <ErrorAlert message={error} className="mb-4" />}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-surface-raised shadow-(--shadow-card)">
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Tên loại xe</th>
              <th className="px-4 py-3 font-medium">Mã</th>
              <th className="px-4 py-3 font-medium">Diện tích 1 chỗ (m²)</th>
              <th className="px-4 py-3 text-right font-medium">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">Đang tải...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">Chưa có loại xe nào</td></tr>
            ) : (
              items.map((item) => (
                <tr key={item.vehicle_type_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-medium text-slate-800">{item.type_name}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-brand-light px-2 py-0.5 font-mono text-xs text-brand">
                      {item.type_code}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {item.slot_area_m2 != null && Number(item.slot_area_m2) > 0
                      ? Number(item.slot_area_m2)
                      : <span className="text-slate-400">—</span>}
                  </td>
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
        title={editing ? 'Sửa loại xe' : 'Thêm loại xe'}
        onClose={() => setModalOpen(false)}
      >
        <ErrorAlert message={error} className="mb-4" />
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Tên loại xe" required error={fieldErrors.typeName}>
            <input
              className={inputClass}
              value={form.typeName}
              onChange={(e) => setForm({ ...form, typeName: e.target.value })}
              placeholder="Ô tô"
              required
            />
          </Field>
          <Field label="Mã loại" required error={fieldErrors.typeCode} hint="Viết tắt, tự động in hoa">
            <input
              className={inputClass}
              value={form.typeCode}
              onChange={(e) => setForm({ ...form, typeCode: e.target.value.toUpperCase() })}
              placeholder="CAR"
              required
            />
          </Field>
          <Field
            label="Diện tích 1 chỗ (m²)"
            error={fieldErrors.slotAreaM2}
            hint="Diện tích hiệu dụng mỗi chỗ đỗ (đã gộp lối đi). Dùng để tính sức chứa tầng theo diện tích."
          >
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputClass}
              value={form.slotAreaM2}
              onChange={(e) => setForm({ ...form, slotAreaM2: e.target.value })}
              placeholder="12.5"
            />
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
