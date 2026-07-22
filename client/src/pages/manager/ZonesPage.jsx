import { useEffect, useMemo, useState } from 'react';
import { zonesApi, floorsApi, vehicleTypesApi } from '../../api/masterData';
import Modal, { Field, inputClass, ErrorAlert } from '../../components/Modal';
import FilterBar, { SearchField, SelectField } from '../../components/ui/FilterBar';
import { validateZoneForm } from '../../lib/validate';
import { matchText } from '../../lib/filters';
import { formatFloorLabel } from '../../lib/floor';

const emptyFilters = { text: '', floorId: '', vehicleTypeId: '' };

export default function ZonesPage() {
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState(emptyFilters);
  const [floors, setFloors] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [floorCapacity, setFloorCapacity] = useState(null); // capacity tầng đang chọn trong form
  const [zoneCodePreview, setZoneCodePreview] = useState(''); // mã khu BE sẽ tự sinh (xem trước khi tạo)
  const [form, setForm] = useState({
    floorId: '',
    vehicleTypeId: '',
    zoneCode: '',
    label: '',
    totalSlots: '0',
    monthlyPassCapacity: '',
  });

  // Tầng single tự quản 1 khu mặc định → không cho tạo khu thủ công.
  const zonedFloors = floors.filter((f) => f.layout_mode !== 'single');
  const noZonedFloor = !loading && zonedFloors.length === 0;

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  const filterActive = Boolean(filters.text || filters.floorId || filters.vehicleTypeId);

  const visibleItems = useMemo(
    () =>
      items.filter(
        (item) =>
          matchText(filters.text, item.zone_code, item.label) &&
          (!filters.floorId || String(item.floor_id) === filters.floorId) &&
          (!filters.vehicleTypeId || String(item.vehicle_type_id) === filters.vehicleTypeId),
      ),
    [items, filters],
  );

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

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  // Lấy diện tích còn trống của tầng đang chọn để gợi ý số slot tối đa.
  useEffect(() => {
    let active = true;
    if (!modalOpen || !form.floorId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFloorCapacity(null);
      return undefined;
    }
    floorsApi
      .get(form.floorId)
      .then((res) => { if (active) setFloorCapacity(res.data.data.capacity || null); })
      .catch(() => { if (active) setFloorCapacity(null); });
    return () => { active = false; };
  }, [modalOpen, form.floorId]);

  // Xem trước mã khu BE sẽ sinh khi tạo mới (đủ tầng + loại xe). Sửa thì hiện mã hiện tại.
  useEffect(() => {
    let active = true;
    if (!modalOpen || editing || !form.floorId || !form.vehicleTypeId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setZoneCodePreview('');
      return undefined;
    }
    zonesApi
      .nextCode(form.floorId, form.vehicleTypeId)
      .then((res) => { if (active) setZoneCodePreview(res.data.data.zoneCode); })
      .catch(() => { if (active) setZoneCodePreview(''); });
    return () => { active = false; };
  }, [modalOpen, editing, form.floorId, form.vehicleTypeId]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      floorId: zonedFloors[0]?.floor_id ? String(zonedFloors[0].floor_id) : '',
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
      // Không gửi zoneCode — BE tự sinh mã khu theo <mã tầng>-<mã loại xe>-NN.
      const payload = {
        floorId: Number(form.floorId),
        vehicleTypeId: Number(form.vehicleTypeId),
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
      // Hiển thị nguyên message BE: khóa khu trên tầng single / vượt diện tích tầng…
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

  // Số slot loại đang chọn còn vừa được vào diện tích trống của tầng.
  const selectedVehicleType = vehicleTypes.find((t) => String(t.vehicle_type_id) === String(form.vehicleTypeId));
  const slotArea = selectedVehicleType ? Number(selectedVehicleType.slot_area_m2) : 0;
  // Khi SỬA: total mới THAY THẾ total cũ → phần diện tích khu này đang chiếm phải được
  // cộng lại vào "còn trống" (BE cũng excludeZoneId như vậy). Footprint tính theo loại xe
  // HIỆN TẠI của khu (dấu chân cũ), chỉ cộng khi vẫn đang ở đúng tầng cũ; còn quy ra slot
  // thì chia theo loại xe ĐANG CHỌN trên form (slotArea).
  const editingOldType = editing
    ? vehicleTypes.find((t) => String(t.vehicle_type_id) === String(editing.vehicle_type_id))
    : null;
  const editingFootprint =
    editing && String(form.floorId) === String(editing.floor_id)
      ? Number(editing.total_slots) * (Number(editingOldType?.slot_area_m2) || 0)
      : 0;
  const areaFree =
    floorCapacity && floorCapacity.areaFreeM2 != null
      ? Number(floorCapacity.areaFreeM2) + editingFootprint
      : null;
  const areaFreeDisplay = areaFree != null ? Math.round(areaFree * 10) / 10 : null;
  const freeSlotHint = areaFree != null && slotArea > 0 ? Math.floor(areaFree / slotArea) : null;

  // Khu mặc định của tầng single: khóa Tầng + Loại xe, chỉ cho sửa slot & vé tháng.
  // Đổi loại xe phải làm ở trang Tầng (BE quản loại xe theo tầng).
  const editingFloor = editing ? floors.find((f) => String(f.floor_id) === String(editing.floor_id)) : null;
  const editingSingle = editingFloor?.layout_mode === 'single';

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Khu vực</h1>
          <p className="mt-1 text-sm text-slate-500">Phân vùng theo tầng và loại xe</p>
        </div>
        <button
          onClick={openCreate}
          disabled={noZonedFloor}
          title={noZonedFloor ? 'Chưa có tầng phân khu (zoned) nào để thêm khu' : undefined}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          + Thêm khu
        </button>
      </div>
      {noZonedFloor && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Tất cả tầng đang ở chế độ "1 loại xe" (single) — các tầng này tự quản 1 khu mặc định nên không thể thêm khu thủ công. Tạo tầng "Phân khu" (zoned) để thêm khu.
        </p>
      )}
      <FilterBar
        className="mb-4"
        active={filterActive}
        onReset={() => setFilters(emptyFilters)}
        shown={visibleItems.length}
        total={items.length}
        unitLabel="khu"
        gridClassName="sm:grid-cols-3"
      >
        <SearchField
          label="Mã khu / tên"
          value={filters.text}
          onChange={(v) => setFilter('text', v)}
          placeholder="VD: B1-C-01 hoặc Khu A"
        />
        <SelectField
          label="Tầng"
          value={filters.floorId}
          onChange={(v) => setFilter('floorId', v)}
          allLabel="— Tất cả tầng —"
          options={floors.map((f) => ({ value: String(f.floor_id), label: formatFloorLabel(f.label || f.floor_code) }))}
        />
        <SelectField
          label="Loại xe"
          value={filters.vehicleTypeId}
          onChange={(v) => setFilter('vehicleTypeId', v)}
          allLabel="— Tất cả loại xe —"
          options={vehicleTypes.map((t) => ({ value: String(t.vehicle_type_id), label: t.type_name }))}
        />
      </FilterBar>

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
            ) : visibleItems.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Không có khu nào khớp bộ lọc</td></tr>
            ) : visibleItems.map((item) => (
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
          {editingSingle ? (
            <>
              <Field label="Tầng" hint="Tầng 1 loại xe — chỉ sửa được số slot & vé tháng. Đổi loại xe: vào trang Tầng.">
                <input
                  className={`${inputClass} cursor-not-allowed bg-slate-50 text-slate-500`}
                  value={editingFloor ? `${editingFloor.floor_code} — ${editingFloor.label}` : ''}
                  disabled
                  readOnly
                />
              </Field>
              <Field label="Loại xe">
                <input
                  className={`${inputClass} cursor-not-allowed bg-slate-50 text-slate-500`}
                  value={selectedVehicleType?.type_name || ''}
                  disabled
                  readOnly
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="Tầng" error={fieldErrors.floorId}>
                <select className={inputClass} value={form.floorId} onChange={(e) => setForm({ ...form, floorId: e.target.value })} required>
                  <option value="">— Chọn tầng —</option>
                  {zonedFloors.map((f) => <option key={f.floor_id} value={f.floor_id}>{f.floor_code} — {f.label}</option>)}
                </select>
              </Field>
              <Field label="Loại xe" error={fieldErrors.vehicleTypeId}>
                <select className={inputClass} value={form.vehicleTypeId} onChange={(e) => setForm({ ...form, vehicleTypeId: e.target.value })} required>
                  <option value="">— Chọn loại xe —</option>
                  {vehicleTypes.map((t) => <option key={t.vehicle_type_id} value={t.vehicle_type_id}>{t.type_name}</option>)}
                </select>
              </Field>
            </>
          )}
          <Field label="Mã khu (tự sinh)" hint={editing ? 'Mã do hệ thống quản lý — đổi tầng/loại xe sẽ tự sinh lại.' : 'Mã do hệ thống tự sinh khi lưu.'}>
            <input
              className={`${inputClass} cursor-not-allowed bg-slate-50 text-slate-500`}
              value={editing ? form.zoneCode : zoneCodePreview}
              placeholder="Chọn tầng và loại xe"
              readOnly
            />
          </Field>
          <Field label="Tên hiển thị" error={fieldErrors.label}><input className={inputClass} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required /></Field>
          <Field
            label="Tổng số slot"
            error={fieldErrors.totalSlots}
            hint={
              freeSlotHint != null
                ? `Diện tích tầng còn trống ~${areaFreeDisplay} m² → tối đa ${freeSlotHint} slot loại này`
                : undefined
            }
          >
            <input type="number" min="0" className={inputClass} value={form.totalSlots} onChange={(e) => setForm({ ...form, totalSlots: e.target.value })} required />
          </Field>
          <Field label="Capacity vé tháng (OR-03)" hint="Để trống = không mở bán vé tháng cho khu này" error={fieldErrors.monthlyPassCapacity}>
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
