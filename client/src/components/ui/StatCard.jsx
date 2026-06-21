import { cn } from '../../lib/cn';

export default function StatCard({ label, value, sub, icon: Icon, trend, className }) {
  return (
    <div className={cn('rounded-xl border border-slate-200 bg-white p-5 shadow-(--shadow-card)', className)}>
      <div className="flex items-start justify-between">
        <p className="text-sm text-slate-500">{label}</p>
        {Icon && (
          <div className="rounded-lg bg-brand-light p-2">
            <Icon className="h-4 w-4 text-brand" />
          </div>
        )}
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-800">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
      {trend && <p className="mt-1 text-xs font-medium text-emerald-600">{trend}</p>}
    </div>
  );
}
