import { cn } from '../../lib/cn';

export default function PageHeader({ title, description, breadcrumbs, actions, className }) {
  return (
    <div className={cn('mb-6', className)}>
      {breadcrumbs && (
        <nav className="mb-2 text-xs text-slate-400" aria-label="Breadcrumb">
          {breadcrumbs}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
          {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
