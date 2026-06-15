import { cn } from '../../lib/cn';

export default function Card({ className, children, padding = true }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-slate-200 bg-white shadow-(--shadow-card)',
        padding && 'p-5',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, description, actions, className }) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-start justify-between gap-3', className)}>
      <div>
        {title && <h3 className="text-lg font-semibold text-slate-800">{title}</h3>}
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
