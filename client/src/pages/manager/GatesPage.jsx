import { useEffect, useMemo, useState } from 'react';
import { gatesApi, floorsApi, vehicleTypesApi } from '../../api/masterData';
import Modal, { Field, inputClass, ErrorAlert } from '../../components/Modal';
import FilterBar, { SearchField, SelectField } from '../../components/ui/FilterBar';
import { validateGateForm } from '../../lib/validate';
import { matchText } from '../../lib/filters';
import { formatFloorLabel } from '../../lib/floor';

const DIRECTION_LABELS = { in: 'Vào', out: 'Ra' };

const DIRECTION_OPTIONS = [
  { value: 'in', label: 'Vào (IN)' },
  { value: 'out', label: 'Ra (OUT)' },
];

const ACTIVE_OPTIONS = [
  { value: 'yes', label: 'Đang bật' },
  { value: 'no', label: 'Đang tắt' },
];

// 'building' = cổng cấp tòa nhà (floor_id null), khớp sentinel dùng trong form.
const emptyFilters = { text: '', floorId: '', direction: '', active: '' };

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
  const [filters, setFilters] = useState(emptyFilters);

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  const filterActive = Boolean(filters.text || filters.floorId || filters.direction || filters.active);

  const visibleItems = useMemo(
    () =>
      items.filter((item) => {
        const floorKey = item.floor_id == null ? 'building' : String(item.floor_id);
        return (
          matchText(filters.text, item.gate_code, item.label) &&
          (!filters.floorId || floorKey === filters.floorId) &&
          (!filters.direction || item.direction === filters.direction) &&
          (!filters.active || (filters.active === 'yes' ? item.is_active : !item.is_active))
        );
      }),
    [items, filters],
  );

  const load = async () => {
    setLoading(true);
    try {
      const [gatesRes, floorsRes, typesRes] = await Promise.all([
        gatesApi.list(),
        floorsApi.list(),
        vehicleTypesApi.list(),
      ]);
      // Mỗi tầng cần đủ cổng vào (IN) + ra (OUT) — hiển thị cả hai chiều cho Manager quản.
      setItems(gatesRes.data.data || []);
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
    const first = floors[0];
    setForm({
      ...emptyForm(),
      floorId: first?.floor_id ? String(first.floor_id) : '',
      // Tầng single: cổng phải gắn đúng loại xe của tầng (khóa, không cho chỉnh).
      vehicleTypeId: first?.layout_mode === 'single' && first.vehicle_type_id
        ? String(first.vehicle_type_id)
        : '',
    });
    setError('');
    setFieldErrors({});
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      // floor_id = null nghĩa là cổng cấp tòa nhà → sentinel 'building'.
      floorId: item.floor_id == null ? 'building' : String(item.floor_id),
      gateCode: item.gate_code,
      label: item.label || '',
      direction: item.direction,
      vehicleTypeId: item.vehicle_type_id ? String(item.vehicle_type_id) : '',
      isActive: item.is_active,
    });
    setError('');
    setFieldErrors({});
    setModalOpen(true);
  };

  // Đổi phạm vi (tầng / tòa nhà): tầng single ép loại xe theo tầng, còn lại reset "Không giới hạn".
  const onFloorChange = (value) => {
    const f = floors.find((x) => String(x.floor_id) === String(value));
    setForm((prev) => ({
      ...prev,
      floorId: value,
      vehicleTypeId: f?.layout_mode === 'single' && f.vehicle_type_id
        ? String(f.vehicle_type_id)
        : '',
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validateGateForm(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setError('');
    try {
      const payload = {
        // 'building' → null (cổng cấp tòa nhà), còn lại là id tầng cụ thể.
        floorId: form.floorId === 'building' ? null : Number(form.floorId),
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

  const selectedFloor = form.floorId && form.floorId !== 'building'
    ? floors.find((f) => String(f.floor_id) === String(form.floorId))
    : null;
  const floorIsSingle = selectedFloor?.layout_mode === 'single';

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
      <FilterBar
        className="mb-4"
        active={filterActive}
        onReset={() => setFilters(emptyFilters)}
        shown={visibleItems.length}
        total={items.length}
        unitLabel="cổng"
      >
        <SearchField
          label="Mã cổng / nhãn"
          value={filters.text}
          onChange={(v) => setFilter('text', v)}
          placeholder="VD: IN-CAR"
        />
        <SelectField
          label="Phạm vi"
          value={filters.floorId}
          onChange={(v) => setFilter('floorId', v)}
          allLabel="— Tất cả phạm vi —"
          options={[
            { value: 'building', label: 'Cổng tòa nhà' },
            ...floors.map((f) => ({ value: String(f.floor_id), label: formatFloorLabel(f.label || f.floor_code) })),
          ]}
        />
        <SelectField
          label="Hướng"
          value={filters.direction}
          onChange={(v) => setFilter('direction', v)}
          allLabel="— Cả hai chiều —"
          options={DIRECTION_OPTIONS}
        />
        <SelectField
          label="Kích hoạt"
          value={filters.active}
          onChange={(v) => setFilter('active', v)}
          allLabel="— Tất cả —"
          options={ACTIVE_OPTIONS}
        />
      </FilterBar>
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
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Chưa có cổng nào</td></tr>
            ) : visibleItems.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Không có cổng nào khớp bộ lọc</td></tr>
            ) : visibleItems.map((item) => (
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
          <Field label="Phạm vi" error={fieldErrors.floorId}>
            <select className={inputClass} value={form.floorId} onChange={(e) => onFloorChange(e.target.value)} required>
              <option value="">Chọn phạm vi</option>
              <option value="building">— Cổng tòa nhà (không thuộc tầng) —</option>
              {floors.map((f) => <option key={f.floor_id} value={f.floor_id}>{f.floor_code} — {f.label}</option>)}
            </select>
          </Field>
          <Field label="Mã cổng (gate code)" error={fieldErrors.gateCode}>
            <input className={inputClass} value={form.gateCode} onChange={(e) => setForm({ ...form, gateCode: e.target.value })} required placeholder="IN-CAR" />
          </Field>
          <Field label="Nhãn hiển thị (staff)">
            <input className={inputClass} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Cổng vào ô tô B1" />
          </Field>
          {floorIsSingle ? (
            <Field label="Loại xe" hint="Tầng 1 loại xe — cổng tự gắn theo loại xe của tầng, không chỉnh ở đây.">
              <input
                className={`${inputClass} cursor-not-allowed bg-slate-50 text-slate-500`}
                value={vehicleTypes.find((t) => String(t.vehicle_type_id) === String(form.vehicleTypeId))?.type_name || '—'}
                disabled
                readOnly
              />
            </Field>
          ) : (
            <Field label="Loại xe">
              <select className={inputClass} value={form.vehicleTypeId} onChange={(e) => setForm({ ...form, vehicleTypeId: e.target.value })}>
                <option value="">Không giới hạn</option>
                {vehicleTypes.map((t) => (
                  <option key={t.vehicle_type_id} value={t.vehicle_type_id}>{t.type_name}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-400">Nên chọn loại xe để validate khi check-in.</p>
            </Field>
          )}
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
