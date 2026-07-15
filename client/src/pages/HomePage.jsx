import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getHomePathForRole, getRoleName } from '../lib/auth';
import Button from '../components/ui/Button';

/* Icon SVG inline — tránh thêm dependency */
const Icon = ({ path, className = 'h-6 w-6' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {path}
  </svg>
);

const features = [
  {
    title: 'Tìm chỗ tức thì',
    desc: 'Xem chỗ trống theo tầng và khu vực theo thời gian thực, không còn chạy lòng vòng.',
    icon: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  },
  {
    title: 'Đặt chỗ & vé tháng',
    desc: 'Giữ chỗ trước khi đến và mua vé tháng chỉ với vài thao tác trên điện thoại.',
    icon: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  },
  {
    title: 'Thanh toán minh bạch',
    desc: 'Tính phí tự động theo giờ/ngày và loại xe, hóa đơn rõ ràng cho mỗi lượt gửi.',
    icon: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>,
  },
  {
    title: 'Phân quyền theo vai trò',
    desc: 'Admin, Quản lý, Nhân viên và Khách hàng — mỗi vai trò có không gian làm việc riêng.',
    icon: <><path d="M12 2 4 6v6c0 5 8 8 8 8s8-3 8-8V6z" /><path d="m9 12 2 2 4-4" /></>,
  },
  {
    title: 'Báo cáo & thống kê',
    desc: 'Doanh thu theo ngày, tỷ lệ lấp đầy và phân tích giờ cao điểm trong một bảng điều khiển.',
    icon: <><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></>,
  },
  {
    title: 'Vận hành tại cổng',
    desc: 'Nhân viên ghi nhận xe vào/ra nhanh chóng, hạn chế ùn tắc tại lối ra vào.',
    icon: <><path d="M14 9V5a3 3 0 0 0-6 0v4" /><rect x="4" y="9" width="16" height="11" rx="2" /></>,
  },
];

/* Khu công khai cho khách — xem không cần đăng nhập */
const guestLinks = [
  {
    to: '/pricing',
    title: 'Bảng giá',
    desc: 'Xem giá đỗ theo loại xe — công khai, không cần đăng nhập.',
    icon: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h8M8 15h5" /></>,
  },
  {
    to: '/availability',
    title: 'Chỗ trống',
    desc: 'Tra cứu số chỗ trống theo tầng và khu vực theo thời gian thực.',
    icon: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  },
  {
    to: '/info',
    title: 'Quy định',
    desc: 'Giờ mở cửa, loại xe hỗ trợ và nội quy bãi đỗ.',
    icon: <><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" /></>,
  },
];

const steps = [
  { n: '01', title: 'Đăng ký tài khoản', desc: 'Tạo tài khoản khách hàng miễn phí chỉ trong một phút.' },
  { n: '02', title: 'Tìm & đặt chỗ', desc: 'Chọn bãi đỗ, xem chỗ trống và giữ chỗ theo nhu cầu.' },
  { n: '03', title: 'Gửi xe & thanh toán', desc: 'Vào/ra bằng biển số, hệ thống tính phí tự động.' },
];

const stats = [
  { value: '4', label: 'Vai trò người dùng' },
  { value: '100%', label: 'Tính phí tự động' },
  { value: '24/7', label: 'Theo dõi thời gian thực' },
  { value: '0đ', label: 'Phí đăng ký tài khoản' },
];

export default function HomePage() {
  const { isAuthenticated, user } = useAuth();
  const primaryTo = isAuthenticated ? getHomePathForRole(getRoleName(user)) : '/register';
  const primaryLabel = isAuthenticated ? 'Vào hệ thống' : 'Bắt đầu miễn phí';

  return (
    <>
      {/* HERO */}
      <section id="top" className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-32 left-1/2 h-72 w-[40rem] -translate-x-1/2 rounded-full bg-brand/10 blur-3xl" />
          <div className="absolute right-0 top-24 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
        </div>

        <div className="mx-auto max-w-6xl px-4 py-20 text-center md:py-28">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand-light px-4 py-1.5 text-sm font-medium text-brand">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Giải pháp đỗ xe thông minh
          </span>

          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight text-slate-900 md:text-6xl">
            Đỗ xe <span className="brand-text-gradient">nhanh và tiện lợi</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-500">
            Giải pháp quản lý bãi đỗ xe thông minh cho cuộc sống hiện đại —
            tiết kiệm thời gian, tối ưu chi phí và vận hành minh bạch.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link to={primaryTo}>
              <Button size="lg" className="brand-gradient border-0 px-7 shadow-(--shadow-soft)">
                {primaryLabel}
              </Button>
            </Link>
            <a href="#features">
              <Button size="lg" variant="secondary" className="px-7">
                Khám phá tính năng
              </Button>
            </a>
          </div>

          {/* Stats */}
          <div className="mx-auto mt-16 grid max-w-4xl grid-cols-2 gap-4 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-2xl border border-slate-200 bg-surface-raised p-5 shadow-(--shadow-card)">
                <div className="brand-text-gradient text-3xl font-extrabold">{s.value}</div>
                <div className="mt-1 text-sm text-slate-500">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* QUICK ACCESS — khu công khai cho khách */}
      <section className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Xem ngay, không cần đăng nhập</h2>
          <p className="mt-3 text-slate-500">
            Tra cứu bảng giá, chỗ trống và quy định bãi đỗ chỉ với một chạm.
          </p>
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {guestLinks.map((g) => (
            <Link
              key={g.to}
              to={g.to}
              className="group rounded-2xl border border-slate-200 bg-surface-raised p-6 shadow-(--shadow-card) transition-all hover:-translate-y-1 hover:shadow-(--shadow-soft)"
            >
              <div className="brand-gradient flex h-12 w-12 items-center justify-center rounded-xl text-white">
                <Icon path={g.icon} />
              </div>
              <h3 className="mt-4 flex items-center gap-1.5 text-lg font-semibold text-slate-800 group-hover:text-brand">
                {g.title}
                <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{g.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Mọi thứ bạn cần để vận hành bãi đỗ</h2>
          <p className="mt-3 text-slate-500">
            Từ tìm chỗ, đặt chỗ đến thanh toán và báo cáo — tất cả trong một hệ thống.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-slate-200 bg-surface-raised p-6 shadow-(--shadow-card)"
            >
              <div className="brand-gradient flex h-12 w-12 items-center justify-center rounded-xl text-white">
                <Icon path={f.icon} />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-800">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="bg-surface-raised">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">Bắt đầu chỉ với 3 bước</h2>
            <p className="mt-3 text-slate-500">Đơn giản từ lúc đăng ký đến khi gửi xe.</p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {steps.map((s) => (
              <div key={s.n} className="relative rounded-2xl border border-slate-200 bg-surface p-7">
                <span className="brand-text-gradient text-4xl font-extrabold">{s.n}</span>
                <h3 className="mt-3 text-lg font-semibold text-slate-800">{s.title}</h3>
                <p className="mt-2 text-sm text-slate-500">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="brand-gradient relative overflow-hidden rounded-3xl px-6 py-14 text-center shadow-(--shadow-soft)">
          <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10 animate-float" />
          <div className="pointer-events-none absolute -bottom-12 -left-8 h-56 w-56 rounded-full bg-white/10" />
          <h2 className="relative text-3xl font-bold text-white md:text-4xl">Sẵn sàng đỗ xe thông minh hơn?</h2>
          <p className="relative mx-auto mt-3 max-w-xl text-white/85">
            Tạo tài khoản khách hàng miễn phí và trải nghiệm đặt chỗ ngay hôm nay.
          </p>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <Link to={primaryTo}>
              <Button size="lg" variant="white" className="px-7 shadow-(--shadow-soft)">
                {primaryLabel}
              </Button>
            </Link>
            {!isAuthenticated && (
              <Link to="/login">
                <Button size="lg" variant="whiteOutline" className="px-7">
                  Đăng nhập
                </Button>
              </Link>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
