import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getRoleName, getHomePathForRole, roleLabels } from '../lib/auth';
import { useLogout } from '../hooks/useLogout';
import { resendVerification } from '../api/auth';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import Field, { ErrorAlert } from '../components/ui/Field';
import Button from '../components/ui/Button';
import { toast } from '../components/ui/toast';

export default function RegisterPage() {
  const { register, isAuthenticated, user } = useAuth();
  const logout = useLogout();
  const roleName = getRoleName(user);

  const [form, setForm] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    email: '',
    phone: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Email đã đăng ký thành công (null = còn ở form). BE không phát JWT khi đăng ký —
  // phải xác minh email rồi mới đăng nhập, nên hiện màn "kiểm tra hộp thư" thay vì vào app.
  const [registeredEmail, setRegisteredEmail] = useState(null);
  const [resending, setResending] = useState(false);

  const handleResend = async () => {
    setResending(true);
    try {
      const { data } = await resendVerification(registeredEmail);
      toast.success(data.message || 'Đã gửi lại email xác minh');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Gửi lại email thất bại');
    } finally {
      setResending(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError('Mật khẩu xác nhận không khớp');
      return;
    }
    if (form.password.length < 6) {
      setError('Mật khẩu tối thiểu 6 ký tự');
      return;
    }
    if (!form.email.trim()) {
      setError('Email là bắt buộc');
      return;
    }

    setSubmitting(true);
    try {
      const result = await register({
        username: form.username.trim(),
        password: form.password,
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
      });
      toast.success(result.message || 'Đăng ký thành công! Kiểm tra email để xác minh tài khoản.');
      setRegisteredEmail(form.email.trim());
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Đăng ký thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  // Khách hàng đã đăng nhập thì không cần đăng ký nữa.
  if (isAuthenticated && roleName === 'User') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-4">
        <Card className="w-full max-w-md text-center">
          <h1 className="text-xl font-bold text-slate-800">Bạn đã có tài khoản</h1>
          <p className="mt-2 text-sm text-slate-500">
            Đang đăng nhập <strong>{user?.username}</strong> — không cần đăng ký thêm.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Link to={getHomePathForRole('User')}>
              <Button className="w-full">Vào trang chính</Button>
            </Link>
            <Link to="/" className="text-sm text-brand hover:underline">
              Về trang chủ
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // Nhân viên/quản lý đang đăng nhập: phải đăng xuất trước khi tạo tài khoản khách hàng.
  if (isAuthenticated && roleName !== 'User') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-4">
        <Card className="w-full max-w-md">
          <h1 className="text-xl font-bold text-slate-800">Đăng ký tài khoản khách hàng</h1>
          <p className="mt-2 text-sm text-slate-600">
            Bạn đang đăng nhập <strong>{user?.username}</strong> (
            {roleLabels[roleName] || roleName}). Đăng ký tài khoản mới chỉ dành cho khách hàng —
            cần đăng xuất trước.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Button className="w-full" onClick={logout}>
              Đăng xuất & đăng ký tài khoản mới
            </Button>
            <Link to={getHomePathForRole(roleName)}>
              <Button variant="secondary" className="w-full">
                Về trang {roleLabels[roleName] || roleName}
              </Button>
            </Link>
            <Link to="/" className="text-center text-sm text-brand hover:underline">
              Về trang chủ
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // Đăng ký xong: nhắc mở email bấm link xác minh (link trỏ vào trang xác minh của hệ thống).
  if (registeredEmail) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-4">
        <Card className="w-full max-w-md text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
            <MailCheck className="h-7 w-7 text-emerald-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-800">Kiểm tra hộp thư của bạn</h1>
          <p className="mt-2 text-sm text-slate-600">
            Chúng tôi đã gửi liên kết xác minh tới <strong>{registeredEmail}</strong>.
            Bấm vào liên kết trong email để kích hoạt tài khoản, sau đó quay lại đăng nhập.
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Không thấy email? Kiểm tra mục Spam/Quảng cáo, hoặc bấm gửi lại bên dưới.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Link to="/login">
              <Button className="brand-gradient w-full border-0">Tôi đã xác minh — Đăng nhập</Button>
            </Link>
            <Button variant="secondary" className="w-full" loading={resending} onClick={handleResend}>
              Gửi lại email xác minh
            </Button>
            <Link to="/" className="text-sm text-brand hover:underline">
              Về trang chủ
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface px-4 py-8">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-24 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-brand/10 blur-3xl" />
        <div className="absolute bottom-0 left-10 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />
      </div>
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Link to="/" className="brand-gradient mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl text-xl font-bold text-white shadow-(--shadow-soft)">
            P
          </Link>
          <h1 className="text-2xl font-bold text-slate-800">Đăng ký PBMS</h1>
          <p className="mt-1 text-sm text-slate-500">Tạo tài khoản khách hàng để đặt chỗ & mua vé tháng</p>
        </div>

        <Card>
          <ErrorAlert message={error} className="mb-4" />

          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Họ và tên" required>
              <Input
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                required
              />
            </Field>
            <Field label="Tên đăng nhập" required hint="Tối thiểu 3 ký tự">
              <Input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                autoComplete="username"
                required
                minLength={3}
              />
            </Field>
            <Field label="Email" required hint="Dùng để đặt lại mật khẩu khi quên">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                autoComplete="email"
                required
              />
            </Field>
            <Field label="Số điện thoại">
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                autoComplete="tel"
              />
            </Field>
            <Field label="Mật khẩu" required hint="Tối thiểu 6 ký tự">
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoComplete="new-password"
                required
                minLength={6}
              />
            </Field>
            <Field label="Xác nhận mật khẩu" required>
              <Input
                type="password"
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                autoComplete="new-password"
                required
              />
            </Field>
            <Button type="submit" className="brand-gradient w-full border-0 shadow-(--shadow-soft)" loading={submitting}>
              Đăng ký
            </Button>
          </form>
        </Card>

        <p className="mt-4 text-center text-sm text-slate-500">
          Đã có tài khoản?{' '}
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
