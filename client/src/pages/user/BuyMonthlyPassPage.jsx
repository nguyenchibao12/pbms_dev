import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { TicketPlus, ArrowLeft } from 'lucide-react';
import { monthlyPassApi } from '../../api/monthlyPass';
import { floorsApi, vehicleTypesApi } from '../../api/masterData';
import { publicApi } from '../../api/public';
import { mergeErrors, validatePlateNumber, validateRequired } from '../../lib/validate';
import { PLATE_VN_HINT, cleanPlateInput, normalizePlateOrKeep } from '../../lib/plate';
import { floorsAcceptingVehicleType } from '../../lib/floor';
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

const emptyForm = { plateNumber: '', vehicleTypeId: '', floorId: '', startDate: todayStr() };

export default function BuyMonthlyPassPage() {
  const [floors, setFloors] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [slotCapacity, setSlotCapacity] = useState([]); // sức chứa theo tầng/khu (GET /public/availability)
  const [metaLoading, setMetaLoading] = useState(true);
  const [metaError, setMetaError] = useState('');

  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [capacity, setCapacity] = useState(null);
  const [capacityLoading, setCapacityLoading] = useState(false);
  const [capacityError, setCapacityError] = useState('');

  const patchForm = (patch) => setForm((f) => ({ ...f, ...patch }));

  const loadMeta = useCallback(async () => {
    setMetaLoading(true);
    try {
      // Kèm availability để biết tầng nào CÓ khu cho loại xe nào — lọc dropdown tầng ngay
      // khi khách chọn loại xe, khỏi để họ chọn tầng không nhận xe của mình.
      const [floorRes, vtRes, availRes] = await Promise.all([
        floorsApi.list(),
        vehicleTypesApi.list(),
        publicApi.availability().catch(() => null),
      ]);
      setFloors(floorRes.data.data ?? []);
      setVehicleTypes(vtRes.data.data ?? []);
      setSlotCapacity(availRes?.data.data ?? []);
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

  // Preview sức chứa vé tháng — phụ thuộc tầng + loại xe (endpoint đếm theo hôm nay).
  // Debounce nhẹ 300ms; mọi setState nằm trong callback bất đồng bộ nên không vi phạm
  // react-hooks/set-state-in-effect.
  const hasScope = Boolean(form.floorId && form.vehicleTypeId);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      if (!hasScope) {
        if (active) {
          setCapacity(null);
          setCapacityError('');
          setCapacityLoading(false);
        }
        return;
      }
      setCapacityLoading(true);
      try {
        const { data } = await monthlyPassApi.capacity({
          floorId: Number(form.floorId),
          vehicleTypeId: Number(form.vehicleTypeId),
        });
        if (active) {
          setCapacity(data.data);
          setCapacityError('');
        }
      } catch (err) {
        if (active) {
          setCapacity(null);
          setCapacityError(err.response?.data?.error?.message || 'Không kiểm tra được sức chứa');
        }
      } finally {
        if (active) setCapacityLoading(false);
      }
    }, hasScope ? 300 : 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [hasScope, form.floorId, form.vehicleTypeId]);

  // Còn suất để mua? Chưa có dữ liệu capacity thì chưa chặn (để BE là nguồn chốt cuối).
  const soldOut = capacity && capacity.available <= 0;

  // Tầng khách chọn được: chỉ tầng CÓ khu cho loại xe đang chọn (lọc theo sức chứa, không
  // theo chỗ trống tức thời — suất vé tháng đã có ô "sức chứa" riêng bên dưới lo).
  const floorOptions = floorsAcceptingVehicleType(floors, slotCapacity, form.vehicleTypeId);
  const selectedVtName = vehicleTypes.find((t) => String(t.vehicle_type_id) === String(form.vehicleTypeId))?.type_name;
  // Chỉ kết luận "không có tầng nào" khi đã có đủ dữ liệu tầng + sức chứa để nói vậy.
  const noFloorForVehicle = Boolean(form.vehicleTypeId)
    && floors.length > 0 && slotCapacity.length > 0 && floorOptions.length === 0;

  // Đổi loại xe mà tầng đang chọn không nhận loại đó -> bỏ chọn tầng ngay.
  const onVehicleTypeChange = (vehicleTypeId) => {
    const stillValid = !form.floorId
      || floorsAcceptingVehicleType(floors, slotCapacity, vehicleTypeId)
        .some((f) => String(f.floor_id) === String(form.floorId));
    patchForm({ vehicleTypeId, ...(stillValid ? {} : { floorId: '' }) });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = mergeErrors(
      validatePlateNumber(form.plateNumber),
      validateRequired(form.vehicleTypeId, 'vehicleTypeId', 'loại xe'),
      validateRequired(form.floorId, 'floorId', 'tầng'),
    );
    if (!form.startDate) errors.startDate = 'Vui lòng chọn ngày bắt đầu';
    else if (form.startDate < todayStr()) errors.startDate = 'Ngày bắt đầu không được ở quá khứ';

    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      toast.error(Object.values(errors)[0]);
      return;
    }

    if (soldOut) {
      const msg = 'Tầng/loại xe này đã hết suất vé tháng — thử tầng hoặc loại xe khác.';
      setError(msg);
      toast.error(msg);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const { data } = await monthlyPassApi.create({
        plateNumber: normalizePlateOrKeep(form.plateNumber),
        vehicleTypeId: Number(form.vehicleTypeId),
        floorId: Number(form.floorId),
        startDate: form.startDate,
      });
      const checkoutUrl = data.data?.checkoutUrl;
      if (!checkoutUrl) {
        throw new Error('Không nhận được link thanh toán');
      }
      toast.success('Đã tạo vé — chuyển sang thanh toán vé tháng');
      // Chuyển sang PayOS; trả xong PayOS redirect về /monthly-pass.
      window.location.assign(checkoutUrl);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || 'Mua vé tháng thất bại';
      setError(msg);
      toast.error(msg);
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader
        title="Mua vé tháng"
        description="Vé cố định 1 tháng — chọn bãi và ngày bắt đầu, hệ thống tự tính ngày kết thúc và khung giờ theo giờ mở cửa tòa"
        actions={
          <Link to="/monthly-pass">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Vé của tôi
            </Button>
          </Link>
        }
      />

      {metaError && <ErrorAlert message={metaError} />}

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

          <Field label="Ngày bắt đầu" required error={fieldErrors.startDate}>
            <input
              type="date"
              className={inputClass}
              value={form.startDate}
              min={todayStr()}
              onChange={(e) => patchForm({ startDate: e.target.value })}
            />
          </Field>

          {hasScope && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              {capacityLoading ? (
                <span className="text-slate-500">Đang kiểm tra sức chứa…</span>
              ) : capacityError ? (
                <span className="text-amber-700">{capacityError}</span>
              ) : capacity ? (
                capacity.total <= 0 ? (
                  <span className="font-medium text-red-600">
                    Tầng/loại xe này chưa mở bán vé tháng — thử tầng hoặc loại xe khác
                  </span>
                ) : capacity.available > 0 ? (
                  <span className="font-medium text-emerald-700">
                    Còn {capacity.available}/{capacity.total} suất vé tháng
                  </span>
                ) : (
                  <span className="font-medium text-red-600">
                    Hết suất vé tháng ({capacity.available}/{capacity.total}) — thử tầng hoặc loại xe khác
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
            disabled={metaLoading || soldOut || noFloorForVehicle}
          >
            <TicketPlus className="h-4 w-4" />
            Mua vé &amp; thanh toán
          </Button>
        </form>
      </Card>
    </div>
  );
}
