import { useEffect, useState } from 'react';
import { parkingSlotsApi, zonesApi } from '../../api/masterData';
import Modal, { Field, inputClass, ErrorAlert } from '../../components/Modal';
import { toast } from '../../components/ui/toast';
import { validateSlotForm } from '../../lib/validate';

// Nhãn + màu cho từng trạng thái slot (parking_slot.status).
// available/maintenance/locked: Manager đổi tay; reserved/occupied: hệ thống quản lý.
const STATUS_META = {
  available: { label: 'Trống', cls: 'bg-emerald-50 text-emerald-700' },
  reserved: { label: 'Đã đặt', cls: 'bg-amber-50 text-amber-700' },
  occupied: { label: 'Đang đỗ', cls: 'bg-rose-50 text-rose-700' },
  maintenance: { label: 'Bảo trì', cls: 'bg-slate-100 text-slate-600' },
  locked: { label: 'Khóa', cls: 'bg-slate-200 text-slate-700' },
};

// Trạng thái Manager được phép đặt/đổi tay (khớp ràng buộc backend).
const MANUAL_STATUSES = ['available', 'maintenance', 'locked'];

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status, cls: 'bg-slate-100 text-slate-600' };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

const emptyForm = {
  zoneId: '',
  slotCode: '',
  slotType: '',
  distanceToGate: '',
  distanceToElevator: '',
  status: 'available',
};

export default function ParkingSlotsPage() {
  const [items, setItems] = useState([]);
  const [zones, setZones] = useState([]);
  const [zoneFilter, setZoneFilter] = useState(''); // '' = tất cả khu
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [savingId, setSavingId] = useState(null); // slot_id đang đổi status nhanh
  const [slotCodePreview, setSlotCodePreview] = useState(''); // mã chỗ BE sẽ tự sinh (xem trước khi tạo)
  // Modal "Sinh nhiều chỗ" (bulk): tạo nhiều chỗ 1 lần cho lần đầu lập khu.
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState({ zoneId: '', count: '', distanceStart: '', distanceStep: '' });
  const [bulkInfo, setBulkInfo] = useState(null); // { total, used, remaining } của khu đang chọn
  const [bulkBusy, setBulkBusy] = useState(false);

  // Tải danh sách khu 1 lần để đổ vào dropdown lọc + select trong modal.
  useEffect(() => {
    zonesApi
      .list()
      .then((res) => setZones(res.data.data))
      .catch((err) => setError(err.response?.data?.error?.message || 'Không tải được khu vực'));
  }, []);

  // Tải slot mỗi khi đổi bộ lọc khu.
  const load = async () => {
    setLoading(true);
    try {
      const res = await parkingSlotsApi.list(zoneFilter || undefined);
      setItems(res.data.data);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Không tải được chỗ đỗ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneFilter]);

  // Xem trước mã chỗ BE sẽ sinh khi tạo mới (đã chọn khu). Sửa thì hiện mã hiện tại.
  useEffect(() => {
    let active = true;
    if (!modalOpen || editing || !form.zoneId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSlotCodePreview('');
      return undefined;
    }
    parkingSlotsApi
      .nextCode(form.zoneId)
      .then((res) => { if (active) setSlotCodePreview(res.data.data.slotCode); })
      .catch(() => { if (active) setSlotCodePreview(''); });
    return () => { active = false; };
  }, [modalOpen, editing, form.zoneId]);

  // Tính số chỗ còn thêm được (remaining = total_slots - used) cho khu trong modal bulk.
  useEffect(() => {
    let active = true;
    if (!bulkOpen || !bulkForm.zoneId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBulkInfo(null);
      return undefined;
    }
    const zone = zones.find((z) => String(z.zone_id) === String(bulkForm.zoneId));
    const total = zone ? Number(zone.total_slots) : 0;
    parkingSlotsApi
      .list(bulkForm.zoneId)
      .then((res) => {
        if (!active) return;
        const used = res.data.data.length;
        const remaining = Math.max(total - used, 0);
        setBulkInfo({ total, used, remaining });
        setBulkForm((f) => ({ ...f, count: String(remaining) }));
      })
      .catch(() => { if (active) setBulkInfo(null); });
    return () => { active = false; };
  }, [bulkOpen, bulkForm.zoneId, zones]);

  // reserved/occupied do hệ thống quản lý → không cho đổi status từ form.
  const statusEditable = !editing || MANUAL_STATUSES.includes(editing.status);

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...emptyForm,
      // Mặc định chọn khu đang lọc, nếu không thì khu đầu tiên.
      zoneId: zoneFilter || (zones[0]?.zone_id ? String(zones[0].zone_id) : ''),
    });
    setFieldErrors({});
    setError('');
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      zoneId: String(item.zone_id),
      slotCode: item.slot_code,
      slotType: item.slot_type || '',
      distanceToGate: item.distance_to_gate != null ? String(item.distance_to_gate) : '',
      distanceToElevator: item.distance_to_elevator != null ? String(item.distance_to_elevator) : '',
      status: item.status,
    });
    setFieldErrors({});
    setError('');
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validateSlotForm(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setError('');
    try {
      // Không gửi slotCode — BE tự sinh mã chỗ theo <mã khu>-NN.
      const payload = {
        zoneId: Number(form.zoneId),
        slotType: form.slotType.trim() || null,
        distanceToGate: form.distanceToGate !== '' ? Number(form.distanceToGate) : null,
        distanceToElevator: form.distanceToElevator !== '' ? Number(form.distanceToElevator) : null,
      };
      // Chỉ gửi status khi Manager được phép đặt/đổi (tránh backend từ chối reserved/occupied).
      if (statusEditable) payload.status = form.status;

      if (editing) await parkingSlotsApi.update(editing.slot_id, payload);
      else await parkingSlotsApi.create(payload);
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Lưu thất bại');
    }
  };

  // Đổi status nhanh ngay trên hàng (dùng PUT update với field status).
  const changeStatus = async (item, newStatus) => {
    if (newStatus === item.status) return;
    setSavingId(item.slot_id);
    try {
      await parkingSlotsApi.update(item.slot_id, { status: newStatus });
      await load();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Đổi trạng thái thất bại');
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (item) => {
    if (!confirm(`Xóa chỗ "${item.slot_code}"?`)) return;
    try {
      await parkingSlotsApi.remove(item.slot_id);
      load();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Xóa thất bại');
    }
  };

  const openBulk = () => {
    setBulkForm({
      // Mặc định khu đang lọc, nếu không thì khu đầu tiên.
      zoneId: zoneFilter || (zones[0]?.zone_id ? String(zones[0].zone_id) : ''),
      count: '',
      distanceStart: '',
      distanceStep: '',
    });
    setBulkInfo(null);
    setError('');
    setBulkOpen(true);
  };

  const handleBulk = async (e) => {
    e.preventDefault();
    if (!bulkForm.zoneId) { setError('Vui lòng chọn khu'); return; }
    const count = Number(bulkForm.count);
    if (!Number.isInteger(count) || count < 1) { setError('Số chỗ muốn tạo phải ≥ 1'); return; }
    setError('');
    setBulkBusy(true);
    try {
      const data = { count };
      if (bulkForm.distanceStart !== '') data.distanceStart = Number(bulkForm.distanceStart);
      if (bulkForm.distanceStep !== '') data.distanceStep = Number(bulkForm.distanceStep);
      const res = await zonesApi.bulkSlots(bulkForm.zoneId, data);
      const { created = 0, cappedOut = 0 } = res.data.data || {};
      let msg = `Đã tạo ${created} chỗ.`;
      if (cappedOut > 0) msg += ` ${cappedOut} chỗ bị chặn do khu đã đủ sức chứa.`;
      toast.success(msg);
      setBulkOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Sinh chỗ thất bại');
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Chỗ đỗ</h1>
          <p className="mt-1 text-sm text-slate-500">Chỗ đỗ (parking slot) theo từng khu vực</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={openBulk}
            disabled={zones.length === 0}
            className="rounded-lg border border-blue-600 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Sinh nhiều chỗ
          </button>
          <button
            onClick={openCreate}
            disabled={zones.length === 0}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            + Thêm chỗ
          </button>
        </div>
      </div>

      <div className="mb-4">
        <label className="mr-2 text-sm text-slate-600">Khu vực:</label>
        <select
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={zoneFilter}
          onChange={(e) => setZoneFilter(e.target.value)}
        >
          <option value="">— Tất cả khu —</option>
          {zones.map((z) => (
            <option key={z.zone_id} value={z.zone_id}>
              {z.zone_code} — {z.label}
            </option>
          ))}
        </select>
      </div>

      {error && !modalOpen && !bulkOpen && (
        <div className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3">Mã chỗ</th>
              <th className="px-4 py-3">Khu</th>
              <th className="px-4 py-3">Tầng</th>
              <th className="px-4 py-3">Loại chỗ</th>
              <th className="px-4 py-3">Cách cổng (m)</th>
              <th className="px-4 py-3">Cách thang máy (m)</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Đang tải...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Chưa có chỗ đỗ</td></tr>
            ) : items.map((item) => (
              <tr key={item.slot_id} className="border-b border-slate-100">
                <td className="px-4 py-3 font-medium">{item.slot_code}</td>
                <td className="px-4 py-3">{item.zone?.zone_code || '—'}</td>
                <td className="px-4 py-3">{item.zone?.floor?.floor_code || '—'}</td>
                <td className="px-4 py-3">{item.slot_type || '—'}</td>
                <td className="px-4 py-3">{item.distance_to_gate ?? '—'}</td>
                <td className="px-4 py-3">{item.distance_to_elevator ?? '—'}</td>
                <td className="px-4 py-3">
                  {MANUAL_STATUSES.includes(item.status) ? (
                    <select
                      className="rounded-lg border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
                      value={item.status}
                      disabled={savingId === item.slot_id}
                      onChange={(e) => changeStatus(item, e.target.value)}
                    >
                      {MANUAL_STATUSES.map((s) => (
                        <option key={s} value={s}>{STATUS_META[s].label}</option>
                      ))}
                    </select>
                  ) : (
                    <StatusBadge status={item.status} />
                  )}
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button type="button" onClick={() => openEdit(item)} className="text-blue-600 hover:underline">Sửa</button>
                  <button type="button" onClick={() => handleDelete(item)} className="text-red-600 hover:underline">Xóa</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} title={editing ? 'Sửa chỗ đỗ' : 'Thêm chỗ đỗ'} onClose={() => setModalOpen(false)}>
        <ErrorAlert message={error} />
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Khu vực" error={fieldErrors.zoneId}>
            <select className={inputClass} value={form.zoneId} onChange={(e) => setForm({ ...form, zoneId: e.target.value })} required>
              <option value="">— Chọn khu —</option>
              {zones.map((z) => (
                <option key={z.zone_id} value={z.zone_id}>
                  {z.zone_code} — {z.label} {z.floor?.floor_code ? `(${z.floor.floor_code})` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Mã chỗ (tự sinh)" hint={editing ? 'Mã do hệ thống quản lý — chuyển khu sẽ tự sinh lại.' : 'Mã do hệ thống tự sinh khi lưu.'}>
            <input
              className={`${inputClass} cursor-not-allowed bg-slate-50 text-slate-500`}
              value={editing ? form.slotCode : slotCodePreview}
              placeholder="Chọn khu"
              readOnly
            />
          </Field>
          <Field label="Loại chỗ" hint="Tùy chọn — vd: standard, ev, disabled" error={fieldErrors.slotType}>
            <input className={inputClass} value={form.slotType} onChange={(e) => setForm({ ...form, slotType: e.target.value })} />
          </Field>
          <Field label="Khoảng cách tới cổng (m)" hint="Tùy chọn — dùng cho AI gợi ý slot" error={fieldErrors.distanceToGate}>
            <input type="number" min="0" step="0.01" className={inputClass} value={form.distanceToGate} onChange={(e) => setForm({ ...form, distanceToGate: e.target.value })} />
          </Field>
          <Field label="Khoảng cách tới thang máy (m)" hint="Tùy chọn" error={fieldErrors.distanceToElevator}>
            <input type="number" min="0" step="0.01" className={inputClass} value={form.distanceToElevator} onChange={(e) => setForm({ ...form, distanceToElevator: e.target.value })} />
          </Field>
          <Field
            label="Trạng thái"
            hint={statusEditable ? 'Chỉ đặt được: Trống / Bảo trì / Khóa' : 'Trạng thái này do hệ thống quản lý — không sửa tay'}
          >
            <select
              className={inputClass}
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              disabled={!statusEditable}
            >
              {statusEditable
                ? MANUAL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)
                : <option value={form.status}>{STATUS_META[form.status]?.label || form.status}</option>}
            </select>
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Hủy</button>
            <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">Lưu</button>
          </div>
        </form>
      </Modal>

      <Modal open={bulkOpen} title="Sinh nhiều chỗ" onClose={() => setBulkOpen(false)}>
        <ErrorAlert message={error} />
        <form onSubmit={handleBulk} className="space-y-4">
          <Field label="Khu vực">
            <select
              className={inputClass}
              value={bulkForm.zoneId}
              onChange={(e) => setBulkForm({ ...bulkForm, zoneId: e.target.value })}
              required
            >
              <option value="">— Chọn khu —</option>
              {zones.map((z) => (
                <option key={z.zone_id} value={z.zone_id}>
                  {z.zone_code} — {z.label} {z.floor?.floor_code ? `(${z.floor.floor_code})` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Số chỗ muốn tạo"
            hint={
              bulkInfo
                ? `Khu còn trống ${bulkInfo.remaining}/${bulkInfo.total} chỗ. Nhập vượt sẽ bị BE chặn phần dư.`
                : 'Mã chỗ nối tiếp theo khu sẽ tự sinh.'
            }
          >
            <input
              type="number"
              min="1"
              className={inputClass}
              value={bulkForm.count}
              onChange={(e) => setBulkForm({ ...bulkForm, count: e.target.value })}
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cách cổng — chỗ đầu (m)" hint="Tùy chọn">
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputClass}
                value={bulkForm.distanceStart}
                onChange={(e) => setBulkForm({ ...bulkForm, distanceStart: e.target.value })}
              />
            </Field>
            <Field label="Mỗi chỗ xa thêm (m)" hint="Tùy chọn">
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputClass}
                value={bulkForm.distanceStep}
                onChange={(e) => setBulkForm({ ...bulkForm, distanceStep: e.target.value })}
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setBulkOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Hủy</button>
            <button
              type="submit"
              disabled={bulkBusy || bulkInfo?.remaining === 0}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bulkBusy ? 'Đang tạo...' : 'Sinh chỗ'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
