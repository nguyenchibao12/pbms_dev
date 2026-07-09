import { useState } from 'react';
import { Save, Landmark } from 'lucide-react';
import { updateMe } from '../../api/auth';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Field, { ErrorAlert } from '../../components/ui/Field';
import { inputClass } from '../../components/ui/Input';
import { toast } from '../../components/ui/toast';

// Ràng buộc khớp validator BE (updateMeValidator): số TK 6-30 chữ số; tên/chủ TK tối đa 100.
const ACCOUNT_NUMBER_PATTERN = /^\d{6,30}$/;

// Bỏ trống cả 3 = xoá STK (BE nhận '' rồi set null). Chỉ chặn khi số TK có nhập mà sai định dạng.
function validateBankForm(form) {
  const errors = {};
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
    const errors = validateBankForm(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      toast.error(Object.values(errors)[0]);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const { data } = await updateMe({
        bankName: form.bankName.trim(),
        bankAccountNumber: form.bankAccountNumber.trim(),
        bankAccountHolder: form.bankAccountHolder.trim(),
      });
      updateUser(data.data); // đồng bộ lại context (header, lần vào sau seed đúng)
      toast.success(data.message || 'Đã cập nhật tài khoản ngân hàng');
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
        description="Cập nhật tài khoản ngân hàng để nhận hoàn tiền khi hủy vé tháng"
      />

      <Card>
        {/* Thông tin cơ bản — chỉ hiển thị (đổi họ tên/SĐT không thuộc phạm vi trang này) */}
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-slate-500">Họ tên</dt>
            <dd className="mt-0.5 text-sm text-slate-800">{user?.fullName || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Số điện thoại</dt>
            <dd className="mt-0.5 text-sm text-slate-800">{user?.phone || '—'}</dd>
          </div>
        </dl>

        <div className="my-5 border-t border-slate-200" />

        <form onSubmit={handleSubmit} className="space-y-4">
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
            Lưu tài khoản ngân hàng
          </Button>
        </form>
      </Card>
    </div>
  );
}
