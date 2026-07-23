import { inputClass } from './Input';
import { cn } from '../../lib/cn';

// Ô nhập TIỀN (VND): hiện phân cách nghìn kiểu vi-VN (dấu chấm, khớp với chỗ hiển thị),
// nhưng value trả ra cha là chuỗi SỐ THÔ (chỉ chữ số) — giữ nguyên Number(value) ở submit.
// Rỗng = '' (để phân biệt "chưa nhập" với số 0).
export default function MoneyInput({ value, onChange, className, ...props }) {
  const raw = String(value ?? '').replace(/\D/g, '');
  const display = raw === '' ? '' : Number(raw).toLocaleString('vi-VN');
  return (
    <input
      {...props}
      type="text"
      inputMode="numeric"
      className={cn(inputClass, className)}
      value={display}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
    />
  );
}
