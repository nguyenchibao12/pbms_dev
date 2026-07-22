import { useEffect, useMemo, useState } from 'react';
import { gatesApi, floorsApi } from '../../api/masterData';
import Modal, { Field, inputClass, ErrorAlert } from '../../components/Modal';
import FilterBar, { SearchField, SelectField } from '../../components/ui/FilterBar';
import { validateGateForm } from '../../lib/validate';
import { matchText } from '../../lib/filters';
import { formatFloorLabel } from '../../lib/floor';
import { buildGateCode, findGateCodeConflict, gateTwinMessage } from '../../lib/gateCode';

const DIRECTION_LABELS = { in: 'Vào', out: 'Ra' };

const DIRECTION_OPTIONS = [
  { value: 'in', label: 'Vào (IN)' },
  { value: 'out', label: 'Ra (OUT)' },
];

// 'building' = cổng cấp tòa nhà (floor_id null), khớp sentinel dùng trong form.
const emptyFilters = { text: '', floorId: '', direction: '' };

// Cổng chỉ còn 2 thông số: thuộc phạm vi nào và đi chiều nào. Bỏ loại xe (mỗi tầng 1 cổng
// vào + 1 cổng ra dùng chung mọi loại xe), bỏ nhãn hiển thị (mã F1-IN đã tự nói rõ) và bỏ
// cờ bật/tắt (cổng đã tạo là đang dùng — không cần thì xóa).
const emptyForm = () => ({
  floorId: '',
  direction: 'in',
});

export default function GatesPage() {
  const [items, setItems] = useState([]);
  const [floors, setFloors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [fieldErrors, setFieldErrors] = useState({});
  const [filters, setFilters] = useState(emptyFilters);

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  const filterActive = Boolean(filters.text || filters.floorId || filters.direction);

  const visibleItems = useMemo(
    () =>
      items.filter((item) => {
        const floorKey = item.floor_id == null ? 'building' : String(item.floor_id);
        return (
          matchText(filters.text, item.gate_code) &&
          (!filters.floorId || floorKey === filters.floorId) &&
          (!filters.direction || item.direction === filters.direction)
        );
      }),
    [items, filters],
  );

  const load = async () => {
    setLoading(true);
    try {
      const [gatesRes, floorsRes] = await Promise.all([gatesApi.list(), floorsApi.list()]);
      // Mỗi tầng cần đủ cổng vào (IN) + ra (OUT) — hiển thị cả hai chiều cho Manager quản.
      setItems(gatesRes.data.data || []);
      setFloors(floorsRes.data.data);
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
    setForm({ ...emptyForm(), floorId: first?.floor_id ? String(first.floor_id) : '' });
    setError('');
    setFieldErrors({});
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      // floor_id = null nghĩa là cổng cấp tòa nhà → sentinel 'building'.
      floorId: item.floor_id == null ? 'building' : String(item.floor_id),
      direction: item.direction,
    });
    setError('');
    setFieldErrors({});
    setModalOpen(true);
  };

  const onFloorChange = (value) => setForm((prev) => ({ ...prev, floorId: value }));

  const selectedFloor = form.floorId && form.floorId !== 'building'
    ? floors.find((f) => String(f.floor_id) === String(form.floorId))
    : null;

  // Mã cổng do hệ thống dựng: <mã tầng>-<IN|OUT>. Khi SỬA mà phạm vi + hướng y nguyên thì
  // giữ mã cũ — tránh đổi mã sau lưng Manager chỉ vì họ sửa nhãn.
  const codeInputsUnchanged = editing
    && String(editing.floor_id == null ? 'building' : editing.floor_id) === String(form.floorId)
    && editing.direction === form.direction;

  const gateCode = codeInputsUnchanged
    ? editing.gate_code
    : buildGateCode({ floorCode: selectedFloor?.floor_code, direction: form.direction });

  // Mã bị chiếm = phạm vi đó đã có cổng cùng hướng (mỗi tầng chỉ 1 IN + 1 OUT).
  const codeTwin = gateCode ? findGateCodeConflict(gateCode, items, editing?.gate_id) : null;
  const twinMessage = codeTwin ? gateTwinMessage(codeTwin, floors) : '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validateGateForm({ ...form, gateCode }, { codeConflict: twinMessage });
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setError('');
    try {
      const payload = {
        // 'building' → null (cổng cấp tòa nhà), còn lại là id tầng cụ thể.
        floorId: form.floorId === 'building' ? null : Number(form.floorId),
        // gateCode gửi kèm cho tương thích, BE tự sinh lại theo <mã tầng>-<IN|OUT> và bỏ qua
        // giá trị này (migration 009). Ô mã trên form chỉ là xem trước cùng công thức.
        gateCode,
        // Không gửi label: cổng mới để trống, BE tự lấy gate_code làm nhãn hiển thị.
        // Cũng không gửi vehicleTypeId — migration 009 đã drop cột đó khỏi bảng gate.
        direction: form.direction,
        // Cổng đã tạo là đang dùng. Ép true để bật lại cổng cũ từng bị tắt (không thì
        // cổng tắt vẫn nằm đó chiếm mã mà Staff không quét được).
        isActive: true,
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
            Mỗi tầng đúng 2 cổng: 1 vào (IN) và 1 ra (OUT), dùng chung cho mọi loại xe.
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
          label="Mã cổng"
          value={filters.text}
          onChange={(v) => setFilter('text', v)}
          placeholder="VD: F1-IN"
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
      </FilterBar>
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3">Mã</th>
              <th className="px-4 py-3">Tầng</th>
              <th className="px-4 py-3">Hướng</th>
              <th className="px-4 py-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Đang tải...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Chưa có cổng nào</td></tr>
            ) : visibleItems.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Không có cổng nào khớp bộ lọc</td></tr>
            ) : visibleItems.map((item) => (
              <tr key={item.gate_id} className="border-b border-slate-100">
                <td className="px-4 py-3 font-medium">{item.gate_code}</td>
                <td className="px-4 py-3">{item.floor?.floor_code || item.floor_id}</td>
                <td className="px-4 py-3">{DIRECTION_LABELS[item.direction] || item.direction}</td>
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
          <Field label="Hướng" error={fieldErrors.direction}>
            <select className={inputClass} value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
              <option value="in">Vào (IN)</option>
              <option value="out">Ra (OUT)</option>
            </select>
          </Field>
          <Field
            label="Mã cổng (tự sinh)"
            error={fieldErrors.gateCode || twinMessage}
            hint="Mã dựng theo <mã tầng>-<IN/OUT> — đổi phạm vi hoặc hướng sẽ tự sinh lại."
          >
            <input
              className={`${inputClass} cursor-not-allowed bg-slate-50 font-medium text-slate-600`}
              value={gateCode}
              placeholder="Chọn phạm vi và hướng"
              readOnly
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Hủy</button>
            <button
              type="submit"
              disabled={!gateCode || Boolean(twinMessage)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Lưu
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
