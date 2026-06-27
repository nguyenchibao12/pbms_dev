import { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarPlus, ArrowLeft } from 'lucide-react';
import { reservationsApi } from '../../api/reservations';
import { floorsApi, vehicleTypesApi } from '../../api/masterData';
import { SHIFTS, resolveShiftWindow } from '../../lib/shifts';
import { mergeErrors, validateRequiredText, validateRequired } from '../../lib/validate';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Field, { ErrorAlert } from '../../components/ui/Field';
import { inputClass } from '../../components/ui/Input';
import { toast } from '../../components/ui/toast';

const todayStr = () => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

const emptyForm = { plateNumber: '', vehicleTypeId: '', floorId: '', arrivalDate: todayStr(), shiftId: '' };

export default function ReservePage() {
  const [searchParams] = useSearchParams();
  const [floors, setFloors] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [metaLoading, setMetaLoading] = useState(true);
  const [metaError, setMetaError] = useState('');

  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [availability, setAvailability] = useState(null);
  const [availLoading, setAvailLoading] = useState(false);
  const [availError, setAvailError] = useState('');

  const patchForm = (patch) => setForm((f) => ({ ...f, ...patch }));

  const loadMeta = useCallback(async () => {
    setMetaLoading(true);
    try {
      const [floorRes, vtRes] = await Promise.all([floorsApi.list(), vehicleTypesApi.list()]);
      setFloors(floorRes.data.data ?? []);
      setVehicleTypes(vtRes.data.data ?? []);
      setMetaError('');
    } catch (err) {
      setMetaError(err.response?.data?.error?.message || 'Không tải được dữ liệu bãi đỗ');
    } finally {
      setMetaLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMeta();
  }, [loadMeta]);

  // Điền sẵn Tầng + Loại xe khi vào từ sơ đồ chỗ trống (query param ưu tiên, fallback sessionStorage).
  useEffect(() => {
    let pre = null;
    const qFloor = searchParams.get('floorId');
    if (qFloor) {
      pre = { floorId: qFloor, vehicleTypeId: searchParams.get('vehicleTypeId') || '' };
    } else {
      try {
        pre = JSON.parse(sessionStorage.getItem('pbms_booking_prefill') || 'null');
      } catch {
        // prefill hỏng JSON — giữ pre = null
      }
    }
    sessionStorage.removeItem('pbms_booking_prefill');
    if (pre?.floorId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      patchForm({
        floorId: String(pre.floorId),
        ...(pre.vehicleTypeId ? { vehicleTypeId: String(pre.vehicleTypeId) } : {}),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const complete = Boolean(form.floorId && form.vehicleTypeId && form.arrivalDate && form.shiftId);

  // Preview số chỗ trống trong khung giờ — debounce 400ms, mọi setState nằm trong
  // callback bất đồng bộ nên không vi phạm react-hooks/set-state-in-effect.
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      if (!complete) {
        if (active) {
          setAvailability(null);
          setAvailError('');
          setAvailLoading(false);
        }
        return;
      }
      setAvailLoading(true);
      try {
        const { data } = await reservationsApi.windowAvailability({
          floorId: Number(form.floorId),
          vehicleTypeId: Number(form.vehicleTypeId),
          shiftId: form.shiftId,
          arrivalDate: form.arrivalDate,
        });
        if (active) {
          setAvailability(data.data);
          setAvailError('');
        }
      } catch (err) {
        if (active) {
          setAvailability(null);
          setAvailError(err.response?.data?.error?.message || 'Không kiểm tra được chỗ trống');
        }
      } finally {
        if (active) setAvailLoading(false);
      }
    }, complete ? 400 : 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [complete, form.floorId, form.vehicleTypeId, form.arrivalDate, form.shiftId]);

  const canBook = !availability || availability.canBook;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = mergeErrors(
      validateRequiredText(form.plateNumber, 'plateNumber', 'biển số xe'),
      validateRequired(form.vehicleTypeId, 'vehicleTypeId', 'loại xe'),
      validateRequired(form.floorId, 'floorId', 'tầng'),
      validateRequired(form.shiftId, 'shiftId', 'ca'),
    );
    if (!form.arrivalDate) errors.arrivalDate = 'Vui lòng chọn ngày đến';

    // Chỉ chặn ca ĐÃ KẾT THÚC; ca đang diễn ra vẫn cho đặt vào (#6).
    if (!errors.shiftId && !errors.arrivalDate) {
      const win = resolveShiftWindow(form.arrivalDate, form.shiftId);
      if (win && win.end <= new Date()) {
        errors.shiftId = 'Ca đã kết thúc — chọn ca khác hoặc ngày sau';
      }
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      toast.error(Object.values(errors)[0]);
      return;
    }

    if (availability && !availability.canBook) {
      const msg = 'Không còn chỗ trống trong ca đã chọn. Thử ca khác, tầng khác hoặc ngày khác.';
      setError(msg);
      toast.error(msg);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const { data } = await reservationsApi.create({
        plateNumber: form.plateNumber.trim(),
        vehicleTypeId: Number(form.vehicleTypeId),
        floorId: Number(form.floorId),
        shiftId: form.shiftId,
        arrivalDate: form.arrivalDate,
      });
      const checkoutUrl = data.data?.checkoutUrl;
      if (!checkoutUrl) {
        throw new Error('Không nhận được link thanh toán');
      }
      toast.success('Đã giữ chỗ — chuyển sang thanh toán phí giữ chỗ');
      // Chuyển sang PayOS; trả phí xong PayOS redirect về /reservations.
      window.location.assign(checkoutUrl);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || 'Đặt chỗ thất bại';
      setError(msg);
      toast.error(msg);
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader
        title="Đặt chỗ mới"
        description="Chọn bãi, ngày và ca — hệ thống tự gán chỗ tốt nhất, thanh toán phí giữ chỗ để nhận QR"
        actions={
          <Link to="/reservations">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Đơn của tôi
            </Button>
          </Link>
        }
      />

      {metaError && (
        <ErrorAlert message={metaError} />
      )}

      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Biển số xe" required error={fieldErrors.plateNumber}>
            <input
              className={inputClass}
              value={form.plateNumber}
              onChange={(e) => patchForm({ plateNumber: e.target.value })}
              placeholder="VD: 51F-678.90"
              autoComplete="off"
            />
          </Field>

          <Field label="Loại xe" required error={fieldErrors.vehicleTypeId}>
            <select
              className={inputClass}
              value={form.vehicleTypeId}
              onChange={(e) => patchForm({ vehicleTypeId: e.target.value })}
              disabled={metaLoading}
            >
              <option value="">— Chọn loại xe —</option>
              {vehicleTypes.map((t) => (
                <option key={t.vehicle_type_id} value={t.vehicle_type_id}>
                  {t.type_name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Tầng" required error={fieldErrors.floorId}>
            <select
              className={inputClass}
              value={form.floorId}
              onChange={(e) => patchForm({ floorId: e.target.value })}
              disabled={metaLoading}
            >
              <option value="">— Chọn tầng —</option>
              {floors.map((f) => (
                <option key={f.floor_id} value={f.floor_id}>
                  {f.floor_code} — {f.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Ngày đến" required error={fieldErrors.arrivalDate}>
              <input
                type="date"
                className={inputClass}
                value={form.arrivalDate}
                min={todayStr()}
                onChange={(e) => patchForm({ arrivalDate: e.target.value })}
              />
            </Field>

            <Field label="Ca" required error={fieldErrors.shiftId}>
              <select
                className={inputClass}
                value={form.shiftId}
                onChange={(e) => patchForm({ shiftId: e.target.value })}
              >
                <option value="">— Chọn ca —</option>
                {SHIFTS.map((s) => {
                  // Chỉ disable ca đã kết thúc (endTime ≤ now); ca hiện tại vẫn chọn được (#6).
                  const win = resolveShiftWindow(form.arrivalDate, s.id);
                  const ended = win && win.end <= new Date();
                  return (
                    <option key={s.id} value={s.id} disabled={ended}>
                      {s.label} ({s.start}–{s.end}){ended ? ' — đã kết thúc' : ''}
                    </option>
                  );
                })}
              </select>
            </Field>
          </div>

          {complete && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              {availLoading ? (
                <span className="text-slate-500">Đang kiểm tra chỗ trống…</span>
              ) : availError ? (
                <span className="text-amber-700">{availError}</span>
              ) : availability ? (
                availability.canBook ? (
                  <span className="font-medium text-emerald-700">
                    Còn {availability.availableCount}/{availability.totalSlots} chỗ trong ca này
                  </span>
                ) : (
                  <span className="font-medium text-red-600">
                    Hết chỗ trong ca này ({availability.availableCount}/{availability.totalSlots}) — thử ca/tầng/ngày khác
                  </span>
                )
              ) : null}
            </div>
          )}

          <ErrorAlert message={error} />

          <Button
            type="submit"
            className="w-full"
            loading={submitting}
            disabled={metaLoading || !canBook}
          >
            <CalendarPlus className="h-4 w-4" />
            Đặt chỗ &amp; thanh toán
          </Button>
        </form>
      </Card>
    </div>
  );
}
