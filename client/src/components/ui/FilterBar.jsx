import { Search } from 'lucide-react';
import { cn } from '../../lib/cn';
import { inputClass } from './Input';
import Button from './Button';

/**
 * Thanh lọc cho các trang danh sách: lưới ô lọc + dòng chân hiện số kết quả và nút xóa lọc.
 * Lọc chạy ngay khi gõ/chọn (client-side) nên KHÔNG có nút "Áp dụng" — dòng chân chỉ hiện
 * khi đang có bộ lọc, để lúc bình thường thanh lọc gọn như một hàng ô.
 */
export default function FilterBar({
  children,
  active = false,
  onReset,
  shown,
  total,
  unitLabel = 'mục',
  gridClassName = 'sm:grid-cols-2 lg:grid-cols-4',
  className,
}) {
  return (
    <div className={cn('rounded-xl border border-slate-200 bg-white p-4 shadow-(--shadow-card)', className)}>
      <div className={cn('grid gap-3', gridClassName)}>{children}</div>
      {active && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <p className="text-xs text-slate-500">
            Hiển thị <strong className="text-slate-700">{shown}</strong> / {total} {unitLabel}
          </p>
          <Button variant="ghost" size="sm" onClick={onReset}>
            Xóa lọc
          </Button>
        </div>
      )}
    </div>
  );
}

/** Một ô lọc có nhãn nhỏ phía trên. Nhãn nhạt hơn Field thường để thanh lọc không "nặng" hơn nội dung. */
export function FilterField({ label, className, children }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

/** Ô tìm kiếm có icon kính lúp. */
export function SearchField({ label, value, onChange, placeholder, className }) {
  return (
    <FilterField label={label} className={className}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          className={cn(inputClass, 'pl-9')}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      </div>
    </FilterField>
  );
}

/**
 * Ô chọn. Có `allLabel` thì thêm lựa chọn đầu "tất cả" (value rỗng = không lọc);
 * bỏ `allLabel` khi ô luôn phải chọn một giá trị (vd chọn mốc ngày để lọc).
 */
export function SelectField({ label, value, onChange, allLabel, options, className }) {
  return (
    <FilterField label={label} className={className}>
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        {allLabel && <option value="">{allLabel}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </FilterField>
  );
}

/** Cặp ngày từ–đến nằm chung một ô lưới để không phá bố cục cột. */
export function DateRangeField({ label, from, to, onFromChange, onToChange, className }) {
  return (
    <FilterField label={label} className={className}>
      <div className="flex items-center gap-2">
        <input
          type="date"
          className={inputClass}
          value={from}
          max={to || undefined}
          onChange={(e) => onFromChange(e.target.value)}
          aria-label={`${label} — từ ngày`}
        />
        <span className="shrink-0 text-xs text-slate-400">→</span>
        <input
          type="date"
          className={inputClass}
          value={to}
          min={from || undefined}
          onChange={(e) => onToChange(e.target.value)}
          aria-label={`${label} — đến ngày`}
        />
      </div>
    </FilterField>
  );
}
