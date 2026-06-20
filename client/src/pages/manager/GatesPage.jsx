import { useEffect, useState } from 'react';
import { gatesApi, floorsApi, vehicleTypesApi } from '../../api/masterData';
import Modal, { Field, inputClass, ErrorAlert } from '../../components/Modal';
import { validateGateForm } from '../../lib/validate';

const DIRECTION_LABELS = { in: 'Vào', out: 'Ra' };

const emptyForm = () => ({
  floorId: '',
  gateCode: '',
  label: '',
  direction: 'in',
  vehicleTypeId: '',
  isActive: true,
});

export default function GatesPage() {
  const [items, setItems] = useState([]);
  const [floors, setFloors] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [fieldErrors, setFieldErrors] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const [gatesRes, floorsRes, typesRes] = await Promise.all([
        gatesApi.list(),
        floorsApi.list(),
        vehicleTypesApi.list(),
      ]);
      setItems(gatesRes.data.data);
      setFloors(floorsRes.data.data);
      setVehicleTypes(typesRes.data.data);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Không tải được dữ liệu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...emptyForm(),
      floorId: floors[0]?.floor_id ? String(floors[0].floor_id) : '',
    });
    setError('');
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      floorId: String(item.floor_id),
      gateCode: item.gate_code,
      label: item.label || '',
      direction: item.direction,
      vehicleTypeId: item.vehicle_type_id ? String(item.vehicle_type_id) : '',
      isActive: item.is_active,
    });
    setError('');
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validateGateForm(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setError('');
    try {
      const payload = {
        floorId: Number(form.floorId),
        gateCode: form.gateCode,
        label: form.label || undefined,
        direction: form.direction,
        vehicleTypeId: form.vehicleTypeId ? Number(form.vehicleTypeId) : null,
        isActive: form.isActive,
      };
      if (editing) await gatesApi.update(editing.gate_id, payload);
      else await gatesApi.create(payload);
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Save failed');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Xóa cổng này?')) return;
    try {
      await gatesApi.remove(id);
      load();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Delete failed');
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Cổng (Gates)</h1>
          <p className="mt-1 text-sm text-slate-500">
            Mỗi cổng nên gắn loại xe (ô tô / xe máy) để staff không chọn nhầm khi check-in.
          </p>
        </div>
        <button onClick={openCreate} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">+ Thêm cổng</button>
      </div>
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3">Mã</th>
              <th className="px-4 py-3">Nhãn hiển thị</th>
              <th className="px-4 py-3">Tầng</th>
              <th className="px-4 py-3">Loại xe</th>
              <th className="px-4 py-3">Hướng</th>
              <th className="px-4 py-3">Kích hoạt</th>
              <th className="px-4 py-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Đang tải...</td></tr>
            ) : items.map((item) => (
              <tr key={item.gate_id} className="border-b border-slate-100">
                <td className="px-4 py-3 font-medium">{item.gate_code}</td>
                <td className="px-4 py-3">{item.label || '—'}</td>
                <td className="px-4 py-3">{item.floor?.floor_code || item.floor_id}</td>
                <td className="px-4 py-3">{item.vehicleType?.type_name || '—'}</td>
                <td className="px-4 py-3">{DIRECTION_LABELS[item.direction] || item.direction}</td>
                <td className="px-4 py-3">{item.is_active ? 'Có' : 'Không'}</td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button type="button" onClick={() => openEdit(item)} className="text-blue-600 hover:underline">Sửa</button>
                  <button type="button" onClick={() => handleDelete(item.gate_id)} className="text-red-600 hover:underline">Xóa</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={modalOpen} title={editing ? 'Sửa cổng' : 'Thêm cổng'} onClose={() => setModalOpen(false)}>
        <ErrorAlert message={error} />
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Tầng" error={fieldErrors.floorId}>
            <select className={inputClass} value={form.floorId} onChange={(e) => setForm({ ...form, floorId: e.target.value })} required>
              <option value="">Chọn tầng</option>
              {floors.map((f) => <option key={f.floor_id} value={f.floor_id}>{f.floor_code}</option>)}
            </select>
          </Field>
          <Field label="Mã cổng (gate code)" error={fieldErrors.gateCode}>
            <input className={inputClass} value={form.gateCode} onChange={(e) => setForm({ ...form, gateCode: e.target.value })} required placeholder="IN-CAR" />
          </Field>
          <Field label="Nhãn hiển thị (staff)">
            <input className={inputClass} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Cổng vào ô tô B1" />
          </Field>
          <Field label="Loại xe">
            <select className={inputClass} value={form.vehicleTypeId} onChange={(e) => setForm({ ...form, vehicleTypeId: e.target.value })}>
              <option value="">Không giới hạn</option>
              {vehicleTypes.map((t) => (
                <option key={t.vehicle_type_id} value={t.vehicle_type_id}>{t.type_name}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-400">Nên chọn loại xe để validate khi check-in.</p>
          </Field>
          <Field label="Hướng">
            <select className={inputClass} value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
              <option value="in">Vào (IN)</option>
              <option value="out">Ra (OUT)</option>
            </select>
          </Field>
          <Field label="Đang hoạt động">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="h-4 w-4" />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Hủy</button>
            <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">Lưu</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
