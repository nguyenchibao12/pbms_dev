import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { resetPassword } from '../api/auth';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import Field, { ErrorAlert } from '../components/ui/Field';
import Button from '../components/ui/Button';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  // Link trong email có dạng /reset-password?token=...&email=...
  const token = searchParams.get('token') || '';
  const email = searchParams.get('email') || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const linkInvalid = !token || !email;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) {
      setError('Mật khẩu phải từ 6 ký tự trở lên.');
      return;
    }
    if (newPassword !== confirm) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }
    setSubmitting(true);
    try {
      await resetPassword({ email, token, newPassword });
      navigate('/login', {
        replace: true,
        state: { message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới.' },
      });
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Đặt lại mật khẩu thất bại. Link có thể đã hết hạn.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface px-4">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-24 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-brand/10 blur-3xl" />
        <div className="absolute bottom-0 right-10 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />
      </div>
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Link to="/" className="brand-gradient mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl text-xl font-bold text-white shadow-(--shadow-soft)">
            P
          </Link>
          <h1 className="text-2xl font-bold text-slate-800">Đặt lại mật khẩu</h1>
          <p className="mt-1 text-sm text-slate-500">
            {email ? `Cho tài khoản: ${email}` : 'Tạo mật khẩu mới cho tài khoản của bạn'}
          </p>
        </div>

        <Card>
          {linkInvalid ? (
            <div className="space-y-4 text-center">
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                Liên kết không hợp lệ hoặc thiếu thông tin. Vui lòng yêu cầu gửi lại email đặt lại mật khẩu.
              </div>
              <Link to="/forgot-password" className="inline-block font-medium text-brand hover:underline">
                ← Gửi lại yêu cầu
              </Link>
            </div>
          ) : (
            <>
              <ErrorAlert message={error} className="mb-4" />
              <form onSubmit={handleSubmit} className="space-y-4">
                <Field label="Mật khẩu mới" required>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </Field>
                <Field label="Xác nhận mật khẩu" required>
                  <Input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </Field>
                <Button type="submit" className="brand-gradient w-full border-0 shadow-(--shadow-soft)" loading={submitting}>
                  Đặt lại mật khẩu
                </Button>
              </form>
            </>
          )}
        </Card>

        <p className="mt-4 text-center text-sm text-slate-500">
          <Link to="/login" className="font-medium text-brand hover:underline">
            ← Quay lại đăng nhập
          </Link>
        </p>
      </div>
    </div>
  );
}
