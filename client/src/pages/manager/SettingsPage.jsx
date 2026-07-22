import { useEffect, useMemo, useState } from 'react';
import { systemSettingsApi } from '../../api/settings';
import Card, { CardHeader } from '../../components/ui/Card';
import Field, { ErrorAlert } from '../../components/ui/Field';
import { inputClass } from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { toast } from '../../components/ui/toast';

// 11 field Manager được sửa (whitelist BE). GET trả thêm field khác (slot_suggest_strategy,
// booking_*...) — CHỈ đọc/gửi lại đúng 11 key này, không đụng phần còn lại.
const MONEY_GROUP = [
  {
    key: 'booking_fee',
    label: 'Phí giữ chỗ (đặt trước)',
    // Hay bị nhầm với tiền gửi xe. Nói rõ: thu MỘT LẦN lúc đặt, KHÔNG phải tiền gửi xe
    // theo giờ (tiền đó nằm ở Quy tắc giá) và không trừ vào tiền gửi xe khi ra.
    hint: 'VND — thu 1 lần khi khách đặt chỗ trước. KHÔNG phải tiền gửi xe theo giờ (xem Quy tắc giá) và không trừ vào tiền gửi xe.',
  },
  { key: 'monthly_pass_price', label: 'Giá vé tháng', hint: 'VND — số ≥ 0' },
  { key: 'lost_ticket_fee', label: 'Phí mất vé', hint: 'VND — số ≥ 0' },
  { key: 'overstay_fee', label: 'Phụ thu quá giờ', hint: 'VND — số ≥ 0' },
];

const REFUND_GROUP = [
  { key: 'pass_refund_trial_days', label: 'Số ngày đầu hưởng ưu đãi hoàn', hint: 'Số nguyên ≥ 0', kind: 'int0' },
  { key: 'pass_refund_trial_percent', label: '% hoàn trong mấy ngày đầu', hint: '0 – 100', kind: 'percent' },
  { key: 'pass_refund_half_term_percent', label: '% hoàn tới hết nửa hạn', hint: '0 – 100', kind: 'percent' },
  { key: 'pass_refund_bank_info_ttl_days', label: 'Hạn cập nhật STK nhận hoàn (ngày)', hint: 'Số nguyên ≥ 0', kind: 'int0' },
];

// Hoàn phí GIỮ CHỖ (đặt chỗ) — khác nhóm trên (vé tháng). Mốc cutoff cho phép lẻ (0.5 = 30 phút)
// nên dùng kind riêng 'hours0' với step 0.5, không ép số nguyên như 'int0'.
const BOOKING_REFUND_GROUP = [
  { key: 'booking_refund_cutoff_hours', label: 'Hủy trước giờ vào ≥ (giờ) mới được hoàn', hint: 'Số ≥ 0 — cho phép lẻ, VD 0.5 = 30 phút', kind: 'hours0' },
  { key: 'booking_refund_percent', label: '% hoàn phí giữ chỗ', hint: '0 – 100 — đặt 0 là không hoàn', kind: 'percent' },
];

const EDITABLE_KEYS = [
  'booking_fee', 'monthly_pass_price', 'lost_ticket_fee', 'overstay_fee', 'max_parking_hours',
  'booking_refund_cutoff_hours', 'booking_refund_percent',
  'pass_refund_trial_days', 'pass_refund_trial_percent', 'pass_refund_half_term_percent',
  'pass_refund_bank_info_ttl_days',
];

// Chuẩn hóa giá trị từ BE về number | null để so sánh "có đổi hay không".
const normalize = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

export default function SettingsPage() {
  const [initial, setInitial] = useState(null); // {key: number|null} — mốc so sánh
  const [form, setForm] = useState({}); // {key: string} — giá trị ô nhập
  const [maxUnlimited, setMaxUnlimited] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await systemSettingsApi.get();
        if (!active) return;
        const data = res.data.data || {};
        const base = {};
        const formVals = {};
        for (const key of EDITABLE_KEYS) {
          const n = normalize(data[key]);
          base[key] = n;
          formVals[key] = n === null ? '' : String(n);
        }
        setInitial(base);
        setForm(formVals);
        setMaxUnlimited(base.max_parking_hours === null);
      } catch (err) {
        setError(err.response?.data?.error?.message || 'Không tải được cấu hình hệ thống');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Giá trị hiện tại (number|null) của 1 field, xét cả checkbox "không giới hạn".
  const currentValue = (key) => {
    if (key === 'max_parking_hours') return maxUnlimited ? null : normalize(form[key]);
    return normalize(form[key]);
  };

  // Chỉ những field đã đổi so với dữ liệu tải về (để PATCH partial).
  const changedPayload = useMemo(() => {
    if (!initial) return {};
    const payload = {};
    for (const key of EDITABLE_KEYS) {
      if (currentValue(key) !== initial[key]) payload[key] = currentValue(key);
    }
    return payload;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, form, maxUnlimited]);

  const hasChanges = Object.keys(changedPayload).length > 0;

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  // Validate mirror ràng buộc BE — chặn gửi rác, BE vẫn là nguồn chân lý.
  const validate = () => {
    const errs = {};
    for (const key of ['booking_fee', 'monthly_pass_price', 'lost_ticket_fee', 'overstay_fee']) {
      const n = normalize(form[key]);
      if (n === null || Number.isNaN(n) || n < 0) errs[key] = 'Nhập số ≥ 0';
    }
    if (!maxUnlimited) {
      const n = normalize(form.max_parking_hours);
      if (n === null || Number.isNaN(n) || !Number.isInteger(n) || n < 1) {
        errs.max_parking_hours = 'Nhập số nguyên ≥ 1, hoặc tick "Không giới hạn"';
      }
    }
    for (const key of ['pass_refund_trial_days', 'pass_refund_bank_info_ttl_days']) {
      const n = normalize(form[key]);
      if (n === null || Number.isNaN(n) || !Number.isInteger(n) || n < 0) errs[key] = 'Nhập số nguyên ≥ 0';
    }
    for (const key of ['pass_refund_trial_percent', 'pass_refund_half_term_percent', 'booking_refund_percent']) {
      const n = normalize(form[key]);
      if (n === null || Number.isNaN(n) || n < 0 || n > 100) errs[key] = 'Nhập số từ 0 đến 100';
    }
    // Mốc cutoff hoàn đặt chỗ: số thực ≥ 0 (0 = hủy lúc nào cũng được hoàn).
    {
      const n = normalize(form.booking_refund_cutoff_hours);
      if (n === null || Number.isNaN(n) || n < 0) errs.booking_refund_cutoff_hours = 'Nhập số ≥ 0';
    }
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    if (!hasChanges) {
      toast.info('Chưa có thay đổi nào để lưu');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const res = await systemSettingsApi.update(changedPayload);
      const data = res.data.data || {};
      // Đồng bộ lại mốc so sánh + ô nhập từ full cấu hình BE trả về.
      const base = {};
      const formVals = {};
      for (const key of EDITABLE_KEYS) {
        const n = normalize(data[key]);
        base[key] = n;
        formVals[key] = n === null ? '' : String(n);
      }
      setInitial(base);
      setForm(formVals);
      setMaxUnlimited(base.max_parking_hours === null);
      toast.success(res.data.message || 'Đã lưu cấu hình hệ thống');
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Lưu cấu hình thất bại');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="py-10 text-center text-slate-400">Đang tải cấu hình...</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Cấu hình hệ thống</h1>
        <p className="mt-1 text-sm text-slate-500">
          Giá dịch vụ và chính sách hoàn tiền. Lưu xong áp dụng ngay.
        </p>
      </div>

      {error && <ErrorAlert message={error} className="mb-4" />}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader
            title="Giá & giới hạn"
            description="Các khoản phụ thu một lần và giới hạn thời gian gửi. Tiền gửi xe tính theo giờ nằm ở trang Quy tắc giá."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {MONEY_GROUP.map((f) => (
              <Field key={f.key} label={f.label} hint={f.hint} error={fieldErrors[f.key]}>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  className={inputClass}
                  value={form[f.key] ?? ''}
                  onChange={(e) => setField(f.key, e.target.value)}
                />
              </Field>
            ))}
            <Field
              label="Giờ gửi tối đa trước khi tính quá giờ"
              hint={maxUnlimited ? 'Không giới hạn thời gian gửi' : 'Số nguyên ≥ 1 (giờ)'}
              error={fieldErrors.max_parking_hours}
            >
              <input
                type="number"
                min="1"
                step="1"
                className={inputClass}
                value={form.max_parking_hours ?? ''}
                onChange={(e) => setField('max_parking_hours', e.target.value)}
                disabled={maxUnlimited}
              />
              <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand/30"
                  checked={maxUnlimited}
                  onChange={(e) => setMaxUnlimited(e.target.checked)}
                />
                Không giới hạn
              </label>
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Chính sách hoàn tiền vé tháng"
            description="Áp dụng khi khách yêu cầu hoàn vé tháng."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {REFUND_GROUP.map((f) => (
              <Field key={f.key} label={f.label} hint={f.hint} error={fieldErrors[f.key]}>
                <input
                  type="number"
                  min="0"
                  max={f.kind === 'percent' ? '100' : undefined}
                  step="1"
                  className={inputClass}
                  value={form[f.key] ?? ''}
                  onChange={(e) => setField(f.key, e.target.value)}
                />
              </Field>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Chính sách hoàn tiền đặt chỗ"
            description="Áp dụng khi khách hủy đơn giữ chỗ đã thanh toán."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {BOOKING_REFUND_GROUP.map((f) => (
              <Field key={f.key} label={f.label} hint={f.hint} error={fieldErrors[f.key]}>
                <input
                  type="number"
                  min="0"
                  max={f.kind === 'percent' ? '100' : undefined}
                  step={f.kind === 'hours0' ? '0.5' : '1'}
                  className={inputClass}
                  value={form[f.key] ?? ''}
                  onChange={(e) => setField(f.key, e.target.value)}
                />
              </Field>
            ))}
          </div>
        </Card>

        <div className="flex items-center justify-end gap-3">
          {hasChanges && <span className="text-sm text-slate-500">Có thay đổi chưa lưu</span>}
          <Button type="submit" className="brand-gradient border-0" loading={saving} disabled={!hasChanges}>
            Lưu thay đổi
          </Button>
        </div>
      </form>
    </div>
  );
}
