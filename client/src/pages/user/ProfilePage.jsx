import { useState } from 'react';
import { Save, Landmark, UserRound } from 'lucide-react';
import { updateMe } from '../../api/auth';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Field, { ErrorAlert } from '../../components/ui/Field';
import { inputClass } from '../../components/ui/Input';
import { toast } from '../../components/ui/toast';

// Ràng buộc khớp validator BE (updateMeValidator): số TK 6-30 chữ số; tên/chủ TK tối đa 100;
// SĐT 0 + 9-10 số (có thể bỏ trống); họ tên bắt buộc, tối đa 100.
const ACCOUNT_NUMBER_PATTERN = /^\d{6,30}$/;
const PHONE_PATTERN = /^0\d{9,10}$/;

// Bỏ trống cả 3 ô STK = xoá STK (BE nhận '' rồi set null). Chỉ chặn khi có nhập mà sai định dạng.
function validateProfileForm(form) {
  const errors = {};
  const fullName = form.fullName.trim();
  if (!fullName) {
    errors.fullName = 'Vui lòng nhập họ tên';
  } else if (fullName.length > 100) {
    errors.fullName = 'Họ tên tối đa 100 ký tự';
  }
  const phone = form.phone.trim();
  if (phone && !PHONE_PATTERN.test(phone)) {
    errors.phone = 'Số điện thoại không hợp lệ (0 + 9-10 số, VD: 0901234567)';
  }
  const number = form.bankAccountNumber.trim();
  if (number && !ACCOUNT_NUMBER_PATTERN.test(number)) {
    errors.bankAccountNumber = 'Số tài khoản gồm 6-30 chữ số';
  }
  if (form.bankName.trim().length > 100) {
    errors.bankName = 'Tên ngân hàng tối đa 100 ký tự';
  }
  if (form.bankAccountHolder.trim().length > 100) {
    errors.bankAccountHolder = 'Tên chủ tài khoản tối đa 100 ký tự';
  }
  return errors;
}

export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  // Seed từ user trong context (nguồn là GET /auth/me lúc khôi phục phiên — đã có sẵn STK).
  const [form, setForm] = useState({
    fullName: user?.fullName ?? '',
    phone: user?.phone ?? '',
    bankName: user?.bankName ?? '',
    bankAccountNumber: user?.bankAccountNumber ?? '',
    bankAccountHolder: user?.bankAccountHolder ?? '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const patchForm = (patch) => setForm((f) => ({ ...f, ...patch }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validateProfileForm(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      toast.error(Object.values(errors)[0]);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const { data } = await updateMe({
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        bankName: form.bankName.trim(),
        bankAccountNumber: form.bankAccountNumber.trim(),
        bankAccountHolder: form.bankAccountHolder.trim(),
      });
      updateUser(data.data); // đồng bộ lại context (header, lần vào sau seed đúng)
      toast.success(data.message || 'Đã cập nhật hồ sơ');
    } catch (err) {
      const msg = err.response?.data?.error?.message || 'Cập nhật thất bại';
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader
        title="Hồ sơ của tôi"
        description="Cập nhật thông tin cá nhân và tài khoản ngân hàng nhận hoàn tiền"
      />

      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <UserRound className="h-4 w-4 text-brand" />
            Thông tin cá nhân
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Họ tên" error={fieldErrors.fullName}>
              <input
                className={inputClass}
                value={form.fullName}
                onChange={(e) => patchForm({ fullName: e.target.value })}
                placeholder="VD: Nguyễn Văn A"
                maxLength={100}
                autoComplete="name"
              />
            </Field>

            <Field label="Số điện thoại" error={fieldErrors.phone}>
              <input
                className={inputClass}
                value={form.phone}
                onChange={(e) => patchForm({ phone: e.target.value })}
                placeholder="VD: 0901234567"
                inputMode="numeric"
                maxLength={11}
                autoComplete="tel"
              />
            </Field>
          </div>

          <div className="my-5 border-t border-slate-200" />

          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Landmark className="h-4 w-4 text-brand" />
            Tài khoản nhận hoàn tiền
          </h2>

          <Field label="Tên ngân hàng" error={fieldErrors.bankName}>
            <input
              className={inputClass}
              value={form.bankName}
              onChange={(e) => patchForm({ bankName: e.target.value })}
              placeholder="VD: Vietcombank"
              maxLength={100}
              autoComplete="off"
            />
          </Field>

          <Field label="Số tài khoản" error={fieldErrors.bankAccountNumber}>
            <input
              className={inputClass}
              value={form.bankAccountNumber}
              onChange={(e) => patchForm({ bankAccountNumber: e.target.value })}
              placeholder="VD: 0123456789"
              inputMode="numeric"
              maxLength={30}
              autoComplete="off"
            />
          </Field>

          <Field label="Chủ tài khoản" error={fieldErrors.bankAccountHolder}>
            <input
              className={inputClass}
              value={form.bankAccountHolder}
              onChange={(e) => patchForm({ bankAccountHolder: e.target.value })}
              placeholder="VD: NGUYEN VAN A"
              maxLength={100}
              autoComplete="off"
            />
          </Field>

          <ErrorAlert message={error} />

          <Button type="submit" className="w-full" loading={submitting}>
            <Save className="h-4 w-4" />
            Lưu thay đổi
          </Button>
        </form>
      </Card>
    </div>
  );
}
