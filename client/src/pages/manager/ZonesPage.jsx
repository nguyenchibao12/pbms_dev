import { useEffect, useState } from 'react';
import { zonesApi, floorsApi, vehicleTypesApi } from '../../api/masterData';
import Modal, { Field, inputClass, ErrorAlert } from '../../components/Modal';
import { validateZoneForm } from '../../lib/validate';

export default function ZonesPage() {
  const [items, setItems] = useState([]);
  const [floors, setFloors] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    floorId: '',
    vehicleTypeId: '',
    zoneCode: '',
    label: '',
    totalSlots: '0',
    monthlyPassCapacity: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const [zonesRes, floorsRes, typesRes] = await Promise.all([
        zonesApi.list(),
        floorsApi.list(),
        vehicleTypesApi.list(),
      ]);
      setItems(zonesRes.data.data);
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
      floorId: floors[0]?.floor_id ? String(floors[0].floor_id) : '',
      vehicleTypeId: vehicleTypes[0]?.vehicle_type_id ? String(vehicleTypes[0].vehicle_type_id) : '',
      zoneCode: '',
      label: '',
      totalSlots: '0',
      monthlyPassCapacity: '',
    });
    setFieldErrors({});
    setError('');
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      floorId: String(item.floor_id),
      vehicleTypeId: String(item.vehicle_type_id),
      zoneCode: item.zone_code,
      label: item.label,
      totalSlots: String(item.total_slots),
      monthlyPassCapacity: item.monthly_pass_capacity != null ? String(item.monthly_pass_capacity) : '',
    });
    setFieldErrors({});
    setError('');
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validateZoneForm(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setError('');
    try {
      const payload = {
        floorId: Number(form.floorId),
        vehicleTypeId: Number(form.vehicleTypeId),
        zoneCode: form.zoneCode.trim(),
        label: form.label.trim(),
        totalSlots: Number(form.totalSlots),
      };
      if (form.monthlyPassCapacity !== '') {
        payload.monthlyPassCapacity = Number(form.monthlyPassCapacity);
      }
      if (editing) await zonesApi.update(editing.zone_id, payload);
      else await zonesApi.create(payload);
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Lưu thất bại');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Xóa khu vực này?')) return;
    try {
      await zonesApi.remove(id);
      load();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Xóa thất bại');
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Khu vực</h1>
          <p className="mt-1 text-sm text-slate-500">Phân vùng theo tầng và loại xe</p>
        </div>
        <button onClick={openCreate} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">+ Thêm khu</button>
      </div>
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3">Mã</th>
              <th className="px-4 py-3">Tên</th>
              <th className="px-4 py-3">Tầng</th>
              <th className="px-4 py-3">Loại xe</th>
              <th className="px-4 py-3">Số slot</th>
              <th className="px-4 py-3">Capacity vé tháng</th>
              <th className="px-4 py-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Đang tải...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Chưa có khu vực</td></tr>
            ) : items.map((item) => (
              <tr key={item.zone_id} className="border-b border-slate-100">
                <td className="px-4 py-3 font-medium">{item.zone_code}</td>
                <td className="px-4 py-3">{item.label}</td>
                <td className="px-4 py-3">{item.floor?.floor_code || '—'}</td>
                <td className="px-4 py-3">{item.vehicleType?.type_name || '—'}</td>
                <td className="px-4 py-3">{item.total_slots}</td>
                <td className="px-4 py-3">{item.monthly_pass_capacity ?? '—'}</td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button type="button" onClick={() => openEdit(item)} className="text-blue-600 hover:underline">Sửa</button>
                  <button type="button" onClick={() => handleDelete(item.zone_id)} className="text-red-600 hover:underline">Xóa</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={modalOpen} title={editing ? 'Sửa khu vực' : 'Thêm khu vực'} onClose={() => setModalOpen(false)}>
        <ErrorAlert message={error} />
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Tầng" error={fieldErrors.floorId}>
            <select className={inputClass} value={form.floorId} onChange={(e) => setForm({ ...form, floorId: e.target.value })} required>
              <option value="">— Chọn tầng —</option>
              {floors.map((f) => <option key={f.floor_id} value={f.floor_id}>{f.floor_code} — {f.label}</option>)}
            </select>
          </Field>
          <Field label="Loại xe" error={fieldErrors.vehicleTypeId}>
            <select className={inputClass} value={form.vehicleTypeId} onChange={(e) => setForm({ ...form, vehicleTypeId: e.target.value })} required>
              <option value="">— Chọn loại xe —</option>
              {vehicleTypes.map((t) => <option key={t.vehicle_type_id} value={t.vehicle_type_id}>{t.type_name}</option>)}
            </select>
          </Field>
          <Field label="Mã khu" error={fieldErrors.zoneCode}><input className={inputClass} value={form.zoneCode} onChange={(e) => setForm({ ...form, zoneCode: e.target.value })} required /></Field>
          <Field label="Tên hiển thị" error={fieldErrors.label}><input className={inputClass} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required /></Field>
          <Field label="Tổng số slot" error={fieldErrors.totalSlots}><input type="number" min="0" className={inputClass} value={form.totalSlots} onChange={(e) => setForm({ ...form, totalSlots: e.target.value })} required /></Field>
          <Field label="Capacity vé tháng (OR-03)" hint="Để trống = không giới hạn riêng" error={fieldErrors.monthlyPassCapacity}>
            <input type="number" min="0" className={inputClass} value={form.monthlyPassCapacity} onChange={(e) => setForm({ ...form, monthlyPassCapacity: e.target.value })} />
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
