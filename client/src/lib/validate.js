/** Gộp nhiều object lỗi { field: message } thành một. */
export function mergeErrors(...maps) {
  return Object.assign({}, ...maps.filter(Boolean));
}

/** Trả lỗi nếu chuỗi rỗng sau khi trim. */
export function validateRequiredText(value, field, label) {
  const trimmed = (value || '').trim();
  if (!trimmed) return { [field]: `Vui lòng nhập ${label}` };
  return {};
}

/** Validate form loại xe: bắt buộc tên + mã. */
export function validateVehicleTypeForm(form) {
  return mergeErrors(
    validateRequiredText(form.typeName, 'typeName', 'tên loại xe'),
    validateRequiredText(form.typeCode, 'typeCode', 'mã loại xe'),
  );
}
