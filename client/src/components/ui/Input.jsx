import { cn } from '../../lib/cn';

export const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20';

export default function Input({ className, ...props }) {
  return <input className={cn(inputClass, className)} {...props} />;
}
