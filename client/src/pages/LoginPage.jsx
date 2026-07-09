import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getRoleName, resolveRedirectAfterLogin } from '../lib/auth';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import Field, { ErrorAlert } from '../components/ui/Field';
import Button from '../components/ui/Button';
import GoogleLoginButton from '../components/GoogleLoginButton';
import { toast } from '../components/ui/toast';

export default function LoginPage() {
  const { login, loginWithGoogle, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const requestedPath = location.state?.from;
  const loginHint = location.state?.message;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Đã đăng nhập rồi thì chuyển thẳng về trang chính tương ứng vai trò.
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const roleName = getRoleName(user);
    const target = resolveRedirectAfterLogin(roleName, requestedPath);
    navigate(target, { replace: true, state: {} });
  }, [isAuthenticated, user, navigate, requestedPath]);

  if (isAuthenticated) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const result = await login(username, password);
      const roleName = getRoleName(result.user);
      const target = resolveRedirectAfterLogin(roleName, requestedPath);
      navigate(target, { replace: true, state: {} });
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Đăng nhập thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  // Nút Google trả về ID token -> BE verify -> nhận JWT PBMS, redirect theo vai trò như login thường.
  const handleGoogleCredential = async (idToken) => {
    if (!idToken) return;
    setError('');
    setSubmitting(true);
    try {
      const result = await loginWithGoogle(idToken);
      if (result.isNew) toast.success('Chào mừng bạn đến PBMS!');
      const roleName = getRoleName(result.user);
      navigate(resolveRedirectAfterLogin(roleName, requestedPath), { replace: true, state: {} });
    } catch (err) {
      const code = err.response?.data?.error?.code;
      // Token giả/hết hạn/sai client ID -> message BE quá kỹ thuật, hiện câu thân thiện.
      setError(
        code === 'GOOGLE_TOKEN_INVALID'
          ? 'Đăng nhập Google thất bại — vui lòng thử lại.'
          : err.response?.data?.error?.message || 'Đăng nhập Google thất bại.',
      );
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
          <h1 className="text-2xl font-bold text-slate-800">Đăng nhập PBMS</h1>
          <p className="mt-1 text-sm text-slate-500">Chào mừng trở lại 👋</p>
        </div>

        <Card>
          {loginHint && (
            <div className="mb-4 rounded-lg border border-brand/30 bg-brand-light px-4 py-3 text-sm text-brand">
              {loginHint}
            </div>
          )}
          <ErrorAlert message={error} className="mb-4" />

          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Tên đăng nhập" required>
              <Input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </Field>
            <Field label="Mật khẩu" required>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>
            <div className="text-right">
              <Link to="/forgot-password" className="text-sm font-medium text-brand hover:underline">
                Quên mật khẩu?
              </Link>
            </div>
            <Button type="submit" className="brand-gradient w-full border-0 shadow-(--shadow-soft)" loading={submitting}>
              Đăng nhập
            </Button>
          </form>

          {/* Google là đường đăng nhập THÊM — form trên vẫn là đường dự phòng cho tài khoản local. */}
          <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            hoặc
            <span className="h-px flex-1 bg-slate-200" />
          </div>
          <GoogleLoginButton onCredential={handleGoogleCredential} className="flex justify-center" />
        </Card>

        <p className="mt-4 text-center text-sm text-slate-500">
          Chưa có tài khoản?{' '}
          <Link to="/register" className="font-medium text-brand hover:underline">
            Đăng ký
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
