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

/** Trả lỗi nếu giá trị rỗng (dùng cho select/dropdown). */
export function validateRequired(value, field, label) {
  if (value === '' || value === null || value === undefined) {
    return { [field]: `Vui lòng chọn ${label}` };
  }
  return {};
}

/** Số không âm; required=false thì cho phép bỏ trống. */
export function validateNonNegativeNumber(value, field, { required = true } = {}) {
  if (value === '' || value === null || value === undefined) {
    return required ? { [field]: 'Vui lòng nhập số' } : {};
  }
  const n = Number(value);
  if (Number.isNaN(n)) return { [field]: 'Phải là số hợp lệ' };
  if (n < 0) return { [field]: 'Không được âm' };
  return {};
}

/** Validate form tầng: bắt buộc mã tầng, tên hiển thị, cấp tầng. */
export function validateFloorForm(form) {
  const errors = mergeErrors(
    validateRequiredText(form.floorCode, 'floorCode', 'mã tầng'),
    validateRequiredText(form.label, 'label', 'tên hiển thị'),
  );
  if (form.floorLevel === '' || form.floorLevel == null) {
    errors.floorLevel = 'Vui lòng nhập cấp tầng';
  }
  return errors;
}

/** Validate quy tắc giá: loại xe, đơn vị (phút), đơn giá, thời điểm hiệu lực. */
export function validatePricingRuleForm(form) {
  const errors = mergeErrors(
    validateRequired(form.vehicleTypeId, 'vehicleTypeId', 'loại xe'),
    validateNonNegativeNumber(form.unit, 'unit'),
    validateNonNegativeNumber(form.baseRate, 'baseRate'),
  );
  if (!form.effectiveFrom) errors.effectiveFrom = 'Vui lòng chọn thời điểm bắt đầu';
  if (form.effectiveFrom && form.effectiveTo && new Date(form.effectiveFrom) > new Date(form.effectiveTo)) {
    errors.effectiveTo = 'Thời điểm kết thúc phải sau bắt đầu';
  }
  return errors;
}

/** Validate form loại xe: bắt buộc tên + mã. */
export function validateVehicleTypeForm(form) {
  return mergeErrors(
    validateRequiredText(form.typeName, 'typeName', 'tên loại xe'),
    validateRequiredText(form.typeCode, 'typeCode', 'mã loại xe'),
  );
}
