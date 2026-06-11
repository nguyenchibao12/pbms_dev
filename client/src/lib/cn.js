/** Gom các className lại, bỏ giá trị falsy (undefined/false/''). */
export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}
