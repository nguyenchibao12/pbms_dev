import { statusConfig } from '../../lib/slotLayout';
import { cn } from '../../lib/cn';

export default function SlotLegend({ className, dark = true }) {
  const items = Object.entries(statusConfig);

  return (
    <div className={cn('flex flex-wrap gap-3 text-xs', dark ? 'text-slate-300' : 'text-slate-600', className)}>
      {items.map(([key, cfg]) => (
        <span key={key} className="inline-flex items-center gap-1.5">
          <span className={cn('h-2.5 w-2.5 rounded-sm', cfg.dot)} />
          {cfg.label}
        </span>
      ))}
    </div>
  );
}
