import { cn } from '../../lib/cn';

export default function Field({ label, hint, error, required, children, className }) {
  return (
    <div className={cn(className)}>
      {label && (
        <label className="mb-1 block text-sm font-medium text-slate-700">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function ErrorAlert({ message, className }) {
  if (!message) return null;
  return (
    <div className={cn('rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700', className)} role="alert">
      {message}
    </div>
  );
}
