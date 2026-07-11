import { useEffect, useState } from 'react';
import { LayoutGrid, Car, TrendingUp, Banknote, Activity, LogIn, LogOut, RefreshCw } from 'lucide-react';
import { reportsApi } from '../../api/reports';
import Card, { CardHeader } from '../../components/ui/Card';
import StatCard from '../../components/ui/StatCard';
import { ErrorAlert } from '../../components/ui/Field';
import { inputClass } from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';

// Báo cáo (Manager) — gộp occupancy (hiện tại) + doanh thu & lưu lượng (theo khoảng ngày).
// Nguồn: GET /reports/overview (đã bao gồm occupancy). Biểu đồ vẽ bằng CSS bar, không dùng lib.

const fmtMoney = (v) => `${Number(v || 0).toLocaleString('vi-VN')} ₫`;
const fmtNum = (v) => Number(v || 0).toLocaleString('vi-VN');
const fmtPeriod = (iso) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '—');
// 'YYYY-MM-DD' -> 'DD/MM' (cắt trực tiếp, tránh lệch múi giờ khi new Date).
const fmtDayMonth = (d) => {
  if (!d) return '';
  const [, m, day] = String(d).split('-');
  return `${day}/${m}`;
};
// Ngày theo lịch LOCAL (không dùng toISOString vì nó quy về UTC -> lệch ngày lúc sáng sớm).
const toISODate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const TYPE_LABEL = { parking: 'Gửi xe', booking: 'Đặt chỗ', monthly_pass: 'Vé tháng', other: 'Khác' };
const METHOD_LABEL = { payos: 'PayOS (online)', cash: 'Tiền mặt', free: 'Miễn phí' };

// Màu thanh theo mức lấp đầy.
const rateColor = (rate) => (rate >= 80 ? 'bg-red-500' : rate >= 50 ? 'bg-amber-500' : 'bg-emerald-500');

// Khoảng ngày mặc định / preset: N ngày gần nhất tính đến hôm nay.
const presetRange = (days) => {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  return { from: toISODate(from), to: toISODate(to) };
};

// Danh sách phân rã có thanh tỉ lệ (dùng cho doanh thu theo loại / theo phương thức).
function BreakdownList({ rows, labelMap }) {
  if (!rows.length) return <EmptyState title="Không có dữ liệu" className="py-8" />;
  const max = Math.max(...rows.map((r) => r.total), 1);
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.key}>
          <div className="mb-1 flex items-center justify-between gap-2 text-sm">
            <span className="font-medium text-slate-700">{labelMap[r.key] || r.key}</span>
            <span className="whitespace-nowrap text-slate-500">
              {fmtMoney(r.total)} · {fmtNum(r.count)} GD
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-brand" style={{ width: `${(r.total / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Biểu đồ cột dọc — doanh thu theo ngày (1 chuỗi).
function DailyRevenueChart({ data }) {
  if (!data.length) return <EmptyState title="Chưa có doanh thu trong khoảng ngày" className="py-8" />;
  const max = Math.max(...data.map((d) => d.revenue), 1);
  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex h-52 items-stretch gap-2">
        {data.map((d) => (
          <div key={d.date} className="flex min-w-6.5 flex-1 flex-col items-center" title={`${fmtDayMonth(d.date)}: ${fmtMoney(d.revenue)}`}>
            <div className="flex w-full flex-1 items-end">
              <div
                className="w-full rounded-t bg-brand/80"
                style={{ height: `${d.revenue > 0 ? Math.max((d.revenue / max) * 100, 3) : 0}%` }}
              />
            </div>
            <span className="mt-1 whitespace-nowrap text-[10px] text-slate-400">{fmtDayMonth(d.date)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Biểu đồ cột dọc kép — lưu lượng vào/ra theo ngày (2 chuỗi).
function DailyTrafficChart({ data }) {
  if (!data.length) return <EmptyState title="Chưa có lưu lượng trong khoảng ngày" className="py-8" />;
  const max = Math.max(...data.flatMap((d) => [d.entries, d.exits]), 1);
  return (
    <>
      <div className="mb-3 flex gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Lượt vào</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-sky-500" /> Lượt ra</span>
      </div>
      <div className="overflow-x-auto pb-1">
        <div className="flex h-52 items-stretch gap-2">
          {data.map((d) => (
            <div key={d.date} className="flex min-w-8 flex-1 flex-col items-center" title={`${fmtDayMonth(d.date)} — Vào: ${d.entries} · Ra: ${d.exits}`}>
              <div className="flex w-full flex-1 items-end justify-center gap-0.5">
                <div className="w-1/2 rounded-t bg-emerald-500" style={{ height: `${d.entries > 0 ? Math.max((d.entries / max) * 100, 3) : 0}%` }} />
                <div className="w-1/2 rounded-t bg-sky-500" style={{ height: `${d.exits > 0 ? Math.max((d.exits / max) * 100, 3) : 0}%` }} />
              </div>
              <span className="mt-1 whitespace-nowrap text-[10px] text-slate-400">{fmtDayMonth(d.date)}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default function ReportsPage() {
  const [from, setFrom] = useState(() => presetRange(30).from);
  const [to, setTo] = useState(() => presetRange(30).to);
  const [floorId, setFloorId] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async ({ from: f, to: t, floorId: fl }) => {
    setLoading(true);
    setError('');
    try {
      const { data: res } = await reportsApi.overview({ from: f, to: t, floorId: fl });
      setReport(res.data);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Không tải được báo cáo');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Tải lần đầu với khoảng 30 ngày gần nhất — toàn bãi.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load({ from, to, floorId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyFilter = (e) => {
    e?.preventDefault();
    load({ from, to, floorId });
  };

  const applyPreset = (days) => {
    const r = presetRange(days);
    setFrom(r.from);
    setTo(r.to);
    load({ from: r.from, to: r.to, floorId });
  };

  const snapshot = report?.occupancy?.snapshot;
  const byFloor = report?.occupancy?.byFloor || [];
  const revenue = report?.revenue;
  const traffic = report?.traffic;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Báo cáo</h1>
          <p className="mt-1 text-sm text-slate-500">
            Tình trạng bãi hiện tại, doanh thu và lưu lượng vào/ra theo khoảng ngày.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={applyFilter} loading={loading}>
          <RefreshCw className="h-4 w-4" /> Làm mới
        </Button>
      </div>

      {/* Bộ lọc: khoảng ngày + tầng */}
      <Card className="mb-6">
        <form onSubmit={applyFilter} className="flex flex-wrap items-end gap-4">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-600">Từ ngày</span>
            <input type="date" className={inputClass} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-600">Đến ngày</span>
            <input type="date" className={inputClass} value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-600">Tầng</span>
            <select className={inputClass} value={floorId} onChange={(e) => setFloorId(e.target.value)}>
              <option value="">— Toàn bãi —</option>
              {byFloor.map((f) => (
                <option key={f.floorId} value={f.floorId}>{f.floorCode} · {f.label}</option>
              ))}
            </select>
          </label>
          <Button type="submit" className="brand-gradient border-0" loading={loading}>Áp dụng</Button>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => applyPreset(7)}>7 ngày</Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => applyPreset(30)}>30 ngày</Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => applyPreset(90)}>90 ngày</Button>
          </div>
        </form>
      </Card>

      {error && <ErrorAlert message={error} className="mb-4" />}

      {loading && !report ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : !report ? null : (
        <div className="space-y-8">
          {/* 1. Tình trạng bãi HIỆN TẠI (không phụ thuộc khoảng ngày) */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-slate-800">Tình trạng bãi hiện tại</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Tỷ lệ lấp đầy" value={`${snapshot.occupancyRate}%`} sub={`${fmtNum(snapshot.inUse)}/${fmtNum(snapshot.total)} chỗ đang dùng`} icon={TrendingUp} />
              <StatCard label="Tổng số chỗ" value={fmtNum(snapshot.total)} icon={LayoutGrid} />
              <StatCard label="Đang dùng" value={fmtNum(snapshot.occupied)} icon={Car} />
              <StatCard label="Còn trống" value={fmtNum(snapshot.available)} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-yellow-50 px-2.5 py-1 font-medium text-yellow-700">Đã đặt: {fmtNum(snapshot.reserved)}</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">Bảo trì: {fmtNum(snapshot.maintenance)}</span>
              <span className="rounded-full bg-violet-50 px-2.5 py-1 font-medium text-violet-700">Tạm khóa: {fmtNum(snapshot.locked)}</span>
            </div>

            <Card className="mt-4">
              <CardHeader title="Lấp đầy theo tầng" description="Số chỗ đang dùng trên tổng số chỗ mỗi tầng (hiện tại)." />
              {byFloor.length === 0 ? (
                <EmptyState title="Chưa có tầng nào" className="py-8" />
              ) : (
                <div className="space-y-4">
                  {byFloor.map((f) => (
                    <div key={f.floorId}>
                      <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                        <span className="font-medium text-slate-700">{f.floorCode} · {f.label}</span>
                        <span className="whitespace-nowrap text-slate-500">{fmtNum(f.inUse)}/{fmtNum(f.total)} chỗ · {f.occupancyRate}%</span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${rateColor(f.occupancyRate)}`} style={{ width: `${f.occupancyRate}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </section>

          {/* 2. Doanh thu theo khoảng ngày */}
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-800">Doanh thu</h2>
              <span className="text-xs text-slate-400">
                {fmtPeriod(report.period?.from)} – {fmtPeriod(report.period?.to)} · toàn bãi
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard label="Tổng doanh thu" value={fmtMoney(revenue.total)} icon={Banknote} className="sm:col-span-3" />
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader title="Theo loại giao dịch" />
                <BreakdownList rows={(revenue.byType || []).map((r) => ({ key: r.type, total: r.total, count: r.count }))} labelMap={TYPE_LABEL} />
              </Card>
              <Card>
                <CardHeader title="Theo phương thức" />
                <BreakdownList rows={(revenue.byMethod || []).map((r) => ({ key: r.method, total: r.total, count: r.count }))} labelMap={METHOD_LABEL} />
              </Card>
            </div>
            <Card className="mt-4">
              <CardHeader title="Doanh thu theo ngày" />
              <DailyRevenueChart data={revenue.daily || []} />
            </Card>
          </section>

          {/* 3. Lưu lượng theo khoảng ngày */}
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-800">Lưu lượng vào/ra</h2>
              <span className="text-xs text-slate-400">
                {fmtPeriod(report.period?.from)} – {fmtPeriod(report.period?.to)}
                {floorId ? ' · theo tầng đã chọn' : ' · toàn bãi'}
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard label="Lượt vào" value={fmtNum(traffic.entries)} icon={LogIn} />
              <StatCard label="Lượt ra" value={fmtNum(traffic.exits)} icon={LogOut} />
              <StatCard label="Đang trong bãi" value={fmtNum(traffic.activeSessions)} icon={Activity} />
            </div>
            <Card className="mt-4">
              <CardHeader title="Lưu lượng theo ngày" />
              <DailyTrafficChart data={traffic.daily || []} />
            </Card>
          </section>
        </div>
      )}
    </div>
  );
}
