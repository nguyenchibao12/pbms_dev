import { useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../api/auth';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import Field, { ErrorAlert } from '../components/ui/Field';
import Button from '../components/ui/Button';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await forgotPassword(email.trim());
      // BE luôn trả message chung để không lộ email có tồn tại hay không.
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Gửi yêu cầu thất bại, thử lại sau.');
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
          <h1 className="text-2xl font-bold text-slate-800">Quên mật khẩu</h1>
          <p className="mt-1 text-sm text-slate-500">Nhập email để nhận liên kết đặt lại mật khẩu</p>
        </div>

        <Card>
          {sent ? (
            <div className="space-y-4 text-center">
              <div className="rounded-lg border border-brand/30 bg-brand-light px-4 py-3 text-sm text-brand">
                Nếu email tồn tại trong hệ thống, chúng tôi đã gửi một liên kết đặt lại mật khẩu.
                Vui lòng kiểm tra hộp thư (kể cả mục Spam). Liên kết có hiệu lực trong 60 phút.
              </div>
              <Link to="/login" className="inline-block font-medium text-brand hover:underline">
                ← Quay lại đăng nhập
              </Link>
            </div>
          ) : (
            <>
              <ErrorAlert message={error} className="mb-4" />
              <form onSubmit={handleSubmit} className="space-y-4">
                <Field label="Email" required>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    placeholder="ban@example.com"
                    required
                  />
                </Field>
                <Button type="submit" className="brand-gradient w-full border-0 shadow-(--shadow-soft)" loading={submitting}>
                  Gửi liên kết đặt lại
                </Button>
              </form>
            </>
          )}
        </Card>

        <p className="mt-4 text-center text-sm text-slate-500">
          Nhớ ra mật khẩu?{' '}
          <Link to="/login" className="font-medium text-brand hover:underline">
            Đăng nhập
          </Link>
          {' · '}
          <Link to="/" className="text-brand hover:underline">
            Trang chủ
          </Link>
        </p>
      </div>
    </div>
  );
}
