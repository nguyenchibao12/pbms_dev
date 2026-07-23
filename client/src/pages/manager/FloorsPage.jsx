import { useEffect, useMemo, useState } from 'react';
import { floorsApi, vehicleTypesApi } from '../../api/masterData';
import { validateFloorForm } from '../../lib/validate';
import { matchText } from '../../lib/filters';
import Modal from '../../components/ui/Modal';
import Field, { ErrorAlert } from '../../components/ui/Field';
import FilterBar, { SearchField, SelectField } from '../../components/ui/FilterBar';
import { inputClass } from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { toast } from '../../components/ui/toast';

const emptyForm = { floorCode: '', floorLevel: '', label: '', layoutMode: 'zoned', vehicleTypeId: '', areaM2: '' };

const emptyFilters = { text: '', layoutMode: '', vehicleTypeId: '' };

const LAYOUT_OPTIONS = [
  { value: 'zoned', label: 'Phân khu' },
  { value: 'single', label: '1 loại xe' },
];

// Hiển thị m² gọn (bỏ số 0 thừa), null/—.
const fmtArea = (v) => (v == null ? '—' : `${Number(v)} m²`);

export default function FloorsPage() {
  const [items, setItems] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [capacities, setCapacities] = useState({}); // floor_id -> capacity {areaM2, areaUsedM2, areaFreeM2}
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [filters, setFilters] = useState(emptyFilters);

  // Tải danh sách tầng + loại xe. capacity (diện tích đã dùng / còn trống) đi kèm luôn trong list.
  const load = async () => {
    setLoading(true);
    try {
      const [floorsRes, typesRes] = await Promise.all([floorsApi.list(), vehicleTypesApi.list()]);
      const floors = floorsRes.data.data;
      setItems(floors);
      setVehicleTypes(typesRes.data.data);

      // GET /floors đã trả sẵn capacity → không gọi GET /floors/:id từng tầng nữa (bỏ N+1).
      setCapacities(Object.fromEntries(floors.map((f) => [f.floor_id, f.capacity ?? null])));
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
    setForm(emptyForm);
    setFieldErrors({});
    setError('');
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      floorCode: item.floor_code,
      floorLevel: String(item.floor_level),
      label: item.label,
      layoutMode: item.layout_mode || 'zoned',
      vehicleTypeId: item.vehicle_type_id != null ? String(item.vehicle_type_id) : '',
      areaM2: item.area_m2 != null ? String(item.area_m2) : '',
    });
    setFieldErrors({});
    setError('');
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Đổi chế độ thì không bắt chọn loại xe — BE tự suy từ khu duy nhất của tầng.
    const errors = validateFloorForm(form, { requireVehicleType: !modeChanged }); // validate phía client trước
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setError('');
    setSubmitting(true);
    try {
      if (editing) {
        const payload = {
          floorCode: form.floorCode.trim(),
          floorLevel: Number(form.floorLevel),
          label: form.label.trim(),
          layoutMode: form.layoutMode,
        };
        if (form.layoutMode === 'single' || form.areaM2 !== '') {
          payload.areaM2 = form.areaM2 === '' ? null : Number(form.areaM2);
        }
        // Chỉ gửi loại xe khi GIỮ nguyên chế độ single — lúc đổi chế độ BE tự đặt loại xe.
        if (form.layoutMode === 'single' && !modeChanged && form.vehicleTypeId) {
          payload.vehicleTypeId = Number(form.vehicleTypeId);
        }
        await floorsApi.update(editing.floor_id, payload);
      } else {
        const payload = {
          floorCode: form.floorCode.trim(),
          floorLevel: Number(form.floorLevel),
          label: form.label.trim(),
          layoutMode: form.layoutMode,
        };
        if (form.layoutMode === 'single') {
          payload.vehicleTypeId = Number(form.vehicleTypeId);
          payload.areaM2 = Number(form.areaM2);
        } else if (form.areaM2 !== '') {
          payload.areaM2 = Number(form.areaM2);
        }
        await floorsApi.create(payload);
      }
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

  const vehicleTypeName = (id) =>
    vehicleTypes.find((t) => t.vehicle_type_id === id)?.type_name || '—';

  const isSingle = form.layoutMode === 'single';
  // Chế độ gốc của tầng đang sửa — để biết form có đang ĐỔI chế độ hay không.
  const originalMode = editing ? editing.layout_mode || 'zoned' : null;
  const modeChanged = Boolean(editing) && form.layoutMode !== originalMode;

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  const filterActive = Boolean(filters.text || filters.layoutMode || filters.vehicleTypeId);

  const visibleItems = useMemo(
    () =>
      items.filter(
        (item) =>
          matchText(filters.text, item.floor_code, item.label) &&
          (!filters.layoutMode || item.layout_mode === filters.layoutMode) &&
          // Chỉ tầng "1 loại xe" mới gắn loại xe — lọc loại xe tự loại hết tầng phân khu.
          (!filters.vehicleTypeId || String(item.vehicle_type_id) === filters.vehicleTypeId),
      ),
    [items, filters],
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tầng / Tầng hầm</h1>
          <p className="mt-1 text-sm text-slate-500">Quản lý mã tầng, cấp, chế độ bố trí và diện tích</p>
        </div>
        <Button onClick={openCreate} className="brand-gradient border-0 shadow-(--shadow-soft)">
          + Thêm tầng
        </Button>
      </div>

      {error && !modalOpen && <ErrorAlert message={error} className="mb-4" />}

      <FilterBar
        className="mb-4"
        active={filterActive}
        onReset={() => setFilters(emptyFilters)}
        shown={visibleItems.length}
        total={items.length}
        unitLabel="tầng"
        gridClassName="sm:grid-cols-3"
      >
        <SearchField
          label="Mã tầng / tên"
          value={filters.text}
          onChange={(v) => setFilter('text', v)}
          placeholder="VD: B1 hoặc Tầng hầm"
        />
        <SelectField
          label="Chế độ bố trí"
          value={filters.layoutMode}
          onChange={(v) => setFilter('layoutMode', v)}
          allLabel="— Tất cả chế độ —"
          options={LAYOUT_OPTIONS}
        />
        <SelectField
          label="Loại xe (tầng 1 loại xe)"
          value={filters.vehicleTypeId}
          onChange={(v) => setFilter('vehicleTypeId', v)}
          allLabel="— Tất cả loại xe —"
          options={vehicleTypes.map((t) => ({ value: String(t.vehicle_type_id), label: t.type_name }))}
        />
      </FilterBar>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-surface-raised shadow-(--shadow-card)">
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Mã tầng</th>
              <th className="px-4 py-3 font-medium">Cấp</th>
              <th className="px-4 py-3 font-medium">Tên hiển thị</th>
              <th className="px-4 py-3 font-medium">Chế độ</th>
              <th className="px-4 py-3 font-medium">Diện tích (đã dùng / còn trống)</th>
              <th className="px-4 py-3 text-right font-medium">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Đang tải...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Chưa có tầng nào</td></tr>
            ) : visibleItems.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Không có tầng nào khớp bộ lọc</td></tr>
            ) : (
              visibleItems.map((item) => {
                const cap = capacities[item.floor_id];
                const single = item.layout_mode === 'single';
                return (
                  <tr key={item.floor_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-brand-light px-2 py-0.5 font-mono text-xs text-brand">
                        {item.floor_code}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item.floor_level}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{item.label}</td>
                    <td className="px-4 py-3">
                      {single ? (
                        <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                          1 loại xe · {vehicleTypeName(item.vehicle_type_id)}
                        </span>
                      ) : (
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          Phân khu
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {cap && cap.areaM2 != null ? (
                        <span>
                          {fmtArea(cap.areaUsedM2)} / <span className="text-emerald-700">{fmtArea(cap.areaFreeM2)}</span>
                          <span className="text-slate-400"> · tổng {fmtArea(cap.areaM2)}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">Không giới hạn</span>
                      )}
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
                );
              })
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

          {/* Chế độ bố trí: khi sửa vẫn đổi được, nhưng về single thì BE ràng "tầng còn đúng 1 khu". */}
          <Field
            label="Chế độ bố trí"
            required
            hint={
              !editing
                ? undefined
                : modeChanged
                  ? isSingle
                    ? 'Loại xe cấp tầng sẽ lấy theo khu duy nhất đang có'
                    : 'Tầng sẽ bỏ loại xe cấp tầng, giữ nguyên khu hiện có và cho thêm khu mới'
                  : 'Đổi được: sang phân khu (zoned) luôn cho; về 1 loại xe (single) chỉ khi tầng còn đúng 1 khu và đã nhập diện tích'
            }
          >
            <select
              className={inputClass}
              value={form.layoutMode}
              onChange={(e) => setForm({ ...form, layoutMode: e.target.value })}
            >
              <option value="zoned">Phân khu theo loại xe (thêm khu sau)</option>
              <option value="single">1 loại xe cho cả tầng (tự tạo 1 khu)</option>
            </select>
          </Field>

          {/* Single: bắt buộc loại xe + diện tích. Đổi loại xe ở đây là nơi duy nhất (khu khóa loại xe).
              Lúc ĐỔI chế độ sang single thì ẩn — BE tự lấy loại xe của khu duy nhất. */}
          {isSingle && !modeChanged && (
            <Field
              label="Loại xe"
              required
              error={fieldErrors.vehicleTypeId}
              hint={editing ? 'Đổi loại xe sẽ tính lại sức chứa tầng theo diện tích slot mới' : undefined}
            >
              <select
                className={inputClass}
                value={form.vehicleTypeId}
                onChange={(e) => setForm({ ...form, vehicleTypeId: e.target.value })}
              >
                <option value="">— Chọn loại xe —</option>
                {vehicleTypes.map((t) => (
                  <option key={t.vehicle_type_id} value={t.vehicle_type_id}>{t.type_name}</option>
                ))}
              </select>
            </Field>
          )}

          {/* Diện tích tầng: bắt buộc cho single; tùy chọn cho zoned (đặt để giới hạn). */}
          <Field
            label={isSingle ? 'Diện tích tầng (m²)' : 'Diện tích tầng (m²) — tùy chọn'}
            required={isSingle}
            error={fieldErrors.areaM2}
            hint={isSingle ? 'Dùng để suy ra sức chứa tầng' : 'Để trống = không giới hạn diện tích'}
          >
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputClass}
              value={form.areaM2}
              onChange={(e) => setForm({ ...form, areaM2: e.target.value })}
              placeholder="120"
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
