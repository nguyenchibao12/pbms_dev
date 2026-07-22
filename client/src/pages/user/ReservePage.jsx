import { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarPlus, ArrowLeft } from 'lucide-react';
import { reservationsApi } from '../../api/reservations';
import { floorsApi, vehicleTypesApi } from '../../api/masterData';
import { publicApi } from '../../api/public';
import { SHIFTS, resolveShiftWindow } from '../../lib/shifts';
import { mergeErrors, validatePlateNumber, validateRequired } from '../../lib/validate';
import { PLATE_VN_HINT, cleanPlateInput, normalizePlateOrKeep } from '../../lib/plate';
import { floorsAcceptingVehicleType } from '../../lib/floor';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Field, { ErrorAlert } from '../../components/ui/Field';
import { inputClass } from '../../components/ui/Input';
import { toast } from '../../components/ui/toast';

const toDateStr = (d) => {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

const todayStr = () => toDateStr(new Date());

const emptyForm = { plateNumber: '', vehicleTypeId: '', floorId: '', arrivalDate: todayStr(), shiftId: '' };

export default function ReservePage() {
  const [searchParams] = useSearchParams();
  const [floors, setFloors] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [capacity, setCapacity] = useState([]); // sức chứa theo tầng/khu (GET /public/availability)
  const [metaLoading, setMetaLoading] = useState(true);
  const [metaError, setMetaError] = useState('');

  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [availability, setAvailability] = useState(null);
  const [availLoading, setAvailLoading] = useState(false);
  const [availError, setAvailError] = useState('');

  // Đổi bất kỳ trường nào → xóa lỗi submit cũ (ô đỏ) để không treo thông báo lỗi lỗi thời.
  const patchForm = (patch) => {
    setError('');
    setForm((f) => ({ ...f, ...patch }));
  };

  const loadMeta = useCallback(async () => {
    setMetaLoading(true);
    try {
      // Kèm availability để biết tầng nào CÓ khu cho loại xe nào — lọc dropdown tầng
      // ngay khi khách chọn loại xe, khỏi để họ chọn tầng không nhận xe của mình.
      const [floorRes, vtRes, availRes] = await Promise.all([
        floorsApi.list(),
        vehicleTypesApi.list(),
        publicApi.availability().catch(() => null),
      ]);
      setFloors(floorRes.data.data ?? []);
      setVehicleTypes(vtRes.data.data ?? []);
      setCapacity(availRes?.data.data ?? []);
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

  // Tầng khách chọn được: chỉ tầng CÓ khu cho loại xe đang chọn. Lọc theo sức chứa chứ không
  // theo chỗ trống hiện tại — tầng nay kín vẫn có thể trống ở ca khách định đặt, phần đó đã
  // có ô "chỗ trống trong ca" bên dưới lo.
  const floorOptions = floorsAcceptingVehicleType(floors, capacity, form.vehicleTypeId);
  const selectedVtName = vehicleTypes.find((t) => String(t.vehicle_type_id) === String(form.vehicleTypeId))?.type_name;
  // Chỉ kết luận "không có tầng nào" khi đã có đủ dữ liệu tầng + sức chứa để nói vậy.
  const noFloorForVehicle = Boolean(form.vehicleTypeId)
    && floors.length > 0 && capacity.length > 0 && floorOptions.length === 0;

  // Đổi loại xe mà tầng đang chọn không nhận loại đó -> bỏ chọn tầng ngay.
  const onVehicleTypeChange = (vehicleTypeId) => {
    const stillValid = !form.floorId
      || floorsAcceptingVehicleType(floors, capacity, vehicleTypeId)
        .some((f) => String(f.floor_id) === String(form.floorId));
    patchForm({ vehicleTypeId, ...(stillValid ? {} : { floorId: '' }) });
  };

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
      validatePlateNumber(form.plateNumber),
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
        plateNumber: normalizePlateOrKeep(form.plateNumber),
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
          <Field label="Biển số xe" required error={fieldErrors.plateNumber} hint={PLATE_VN_HINT}>
            <input
              className={inputClass}
              value={form.plateNumber}
              onChange={(e) => patchForm({ plateNumber: cleanPlateInput(e.target.value) })}
              // Rời ô là chuẩn hóa về dạng BE lưu (51F67890 -> 51F-678.90), khách khỏi đoán
              // phải chấm hay gạch ở đâu.
              onBlur={() => patchForm({ plateNumber: normalizePlateOrKeep(form.plateNumber) })}
              placeholder="VD: 51F-678.90"
              autoComplete="off"
            />
          </Field>

          <Field label="Loại xe" required error={fieldErrors.vehicleTypeId}>
            <select
              className={inputClass}
              value={form.vehicleTypeId}
              onChange={(e) => onVehicleTypeChange(e.target.value)}
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

          <Field
            label="Tầng"
            required
            error={fieldErrors.floorId}
            hint={form.vehicleTypeId ? `Chỉ hiện tầng nhận ${selectedVtName || 'loại xe này'}` : 'Chọn loại xe trước để lọc tầng phù hợp'}
          >
            <select
              className={inputClass}
              value={form.floorId}
              onChange={(e) => patchForm({ floorId: e.target.value })}
              disabled={metaLoading}
            >
              <option value="">— Chọn tầng —</option>
              {floorOptions.map((f) => (
                <option key={f.floor_id} value={f.floor_id}>
                  {f.floor_code} — {f.label}
                </option>
              ))}
            </select>
          </Field>

          {noFloorForVehicle && (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Bãi chưa có tầng nào nhận {selectedVtName || 'loại xe này'} — chọn loại xe khác hoặc liên hệ ban quản lý.
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Ngày đến" required error={fieldErrors.arrivalDate}>
              <input
                type="date"
                className={inputClass}
                value={form.arrivalDate}
                min={todayStr()}
                // KHÔNG hardcode trần đặt trước: BE (assertBookableWindow) tự chặn theo
                // booking_max_advance_days (Manager chỉnh được) và trả message đúng số ngày thật.
                // Chọn ngày quá trần → ô "chỗ trống" hiện thông báo BE, nút đặt chỗ bị khóa (availError).
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
            disabled={metaLoading || !canBook || availLoading || Boolean(availError) || noFloorForVehicle}
          >
            <CalendarPlus className="h-4 w-4" />
            Đặt chỗ &amp; thanh toán
          </Button>
        </form>
      </Card>
    </div>
  );
}
