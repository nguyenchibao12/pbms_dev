import { useEffect, useState } from 'react';
import { pricingRulesApi, vehicleTypesApi } from '../../api/masterData';
import { validatePricingRuleForm } from '../../lib/validate';
import Modal from '../../components/ui/Modal';
import Field, { ErrorAlert } from '../../components/ui/Field';
import { inputClass } from '../../components/ui/Input';
import MoneyInput from '../../components/ui/MoneyInput';
import Button from '../../components/ui/Button';
import { toast } from '../../components/ui/toast';

// Chuyển ISO/Date -> chuỗi cho input datetime-local (yyyy-MM-ddTHH:mm, giờ địa phương).
const toDatetimeLocal = (value) => {
  if (!value) return '';
  const d = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fmtMoney = (v) => `${Number(v).toLocaleString('vi-VN')} ₫`;
const fmtDate = (v) => new Date(v).toLocaleString('vi-VN');

export default function PricingRulesPage() {
  const [items, setItems] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ vehicleTypeId: '', unit: '60', baseRate: '', effectiveFrom: '', effectiveTo: '' });
  const [fieldErrors, setFieldErrors] = useState({});

  // Tải song song bảng giá + danh sách loại xe (cho dropdown).
  const load = async () => {
    setLoading(true);
    try {
      const [rulesRes, typesRes] = await Promise.all([pricingRulesApi.list(), vehicleTypesApi.list()]);
      setItems(rulesRes.data.data);
      setVehicleTypes(typesRes.data.data);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Không tải được bảng giá');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Tải dữ liệu một lần khi mở trang.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({
      vehicleTypeId: vehicleTypes[0]?.vehicle_type_id ? String(vehicleTypes[0].vehicle_type_id) : '',
      unit: '60',
      baseRate: '',
      effectiveFrom: toDatetimeLocal(new Date()),
      effectiveTo: '',
    });
    setFieldErrors({});
    setError('');
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      vehicleTypeId: String(item.vehicle_type_id),
      unit: String(item.unit),
      // base_rate là DECIMAL → BE trả "25000.00"; ô tiền chỉ nhận số nguyên nên bỏ phần .00.
      baseRate: String(Math.round(Number(item.base_rate) || 0)),
      effectiveFrom: toDatetimeLocal(item.effective_from),
      effectiveTo: toDatetimeLocal(item.effective_to),
    });
    setFieldErrors({});
    setError('');
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validatePricingRuleForm(form); // validate phía client trước
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setError('');
    setSubmitting(true);
    try {
      const payload = {
        vehicleTypeId: Number(form.vehicleTypeId),
        unit: Number(form.unit),
        baseRate: Number(form.baseRate),
        effectiveFrom: new Date(form.effectiveFrom).toISOString(),
        effectiveTo: form.effectiveTo ? new Date(form.effectiveTo).toISOString() : null,
      };
      if (editing) await pricingRulesApi.update(editing.pricing_rule_id, payload);
      else await pricingRulesApi.create(payload);
      toast.success(editing ? 'Đã cập nhật bảng giá' : 'Đã thêm bảng giá');
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Lưu thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm('Xóa quy tắc giá này?')) return;
    try {
      await pricingRulesApi.remove(item.pricing_rule_id);
      toast.success('Đã xóa quy tắc giá');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Xóa thất bại');
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Bảng giá gửi xe</h1>
          <p className="mt-1 text-sm text-slate-500">Phí = CEIL(thời gian / đơn vị) × đơn giá</p>
        </div>
        <Button onClick={openCreate} className="brand-gradient border-0 shadow-(--shadow-soft)">
          + Thêm quy tắc
        </Button>
      </div>

      {error && !modalOpen && <ErrorAlert message={error} className="mb-4" />}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-surface-raised shadow-(--shadow-card)">
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Loại xe</th>
              <th className="px-4 py-3 font-medium">Đơn vị (phút)</th>
              <th className="px-4 py-3 font-medium">Đơn giá</th>
              <th className="px-4 py-3 font-medium">Hiệu lực từ</th>
              <th className="px-4 py-3 font-medium">Đến</th>
              <th className="px-4 py-3 text-right font-medium">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Đang tải...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Chưa có quy tắc giá nào</td></tr>
            ) : (
              items.map((item) => (
                <tr key={item.pricing_rule_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-medium text-slate-800">{item.vehicleType?.type_name || item.vehicle_type_id}</td>
                  <td className="px-4 py-3">{item.unit}</td>
                  <td className="px-4 py-3 font-medium text-brand">{fmtMoney(item.base_rate)}</td>
                  <td className="px-4 py-3 text-slate-600">{fmtDate(item.effective_from)}</td>
                  <td className="px-4 py-3 text-slate-600">{item.effective_to ? fmtDate(item.effective_to) : '—'}</td>
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
        title={editing ? 'Sửa bảng giá' : 'Thêm bảng giá'}
        onClose={() => setModalOpen(false)}
      >
        <ErrorAlert message={error} className="mb-4" />
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Loại xe" required error={fieldErrors.vehicleTypeId}>
            <select
              className={inputClass}
              value={form.vehicleTypeId}
              onChange={(e) => setForm({ ...form, vehicleTypeId: e.target.value })}
              required
            >
              <option value="">— Chọn loại xe —</option>
              {vehicleTypes.map((t) => (
                <option key={t.vehicle_type_id} value={t.vehicle_type_id}>{t.type_name}</option>
              ))}
            </select>
          </Field>
          <Field label="Đơn vị (phút)" required error={fieldErrors.unit} hint="Ví dụ 60 = tính theo giờ">
            <input type="number" min="1" className={inputClass} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required />
          </Field>
          <Field label="Đơn giá (VND)" required error={fieldErrors.baseRate}>
            <MoneyInput value={form.baseRate} onChange={(v) => setForm({ ...form, baseRate: v })} required />
          </Field>
          <Field label="Hiệu lực từ" required error={fieldErrors.effectiveFrom}>
            <input type="datetime-local" className={inputClass} value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} required />
          </Field>
          <Field label="Hiệu lực đến (tuỳ chọn)" error={fieldErrors.effectiveTo}>
            <input type="datetime-local" className={inputClass} value={form.effectiveTo} onChange={(e) => setForm({ ...form, effectiveTo: e.target.value })} />
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
