import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getRoleName, resolveRedirectAfterLogin } from '../lib/auth';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import Field, { ErrorAlert } from '../components/ui/Field';
import Button from '../components/ui/Button';

export default function LoginPage() {
  const { login, isAuthenticated, user } = useAuth();
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand">
            <span className="text-xl font-bold text-white">P</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Đăng nhập PBMS</h1>
          <p className="mt-1 text-sm text-slate-500">Parking Building Management System</p>
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
            <Button type="submit" className="w-full" loading={submitting}>
              Đăng nhập
            </Button>
          </form>
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
