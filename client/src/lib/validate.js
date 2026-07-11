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

/**
 * Validate form tầng: bắt buộc mã tầng, tên hiển thị, cấp tầng.
 * Chế độ single (1 loại xe cho cả tầng) bắt buộc thêm loại xe + diện tích tầng > 0.
 */
export function validateFloorForm(form) {
  const errors = mergeErrors(
    validateRequiredText(form.floorCode, 'floorCode', 'mã tầng'),
    validateRequiredText(form.label, 'label', 'tên hiển thị'),
  );
  if (form.floorLevel === '' || form.floorLevel == null) {
    errors.floorLevel = 'Vui lòng nhập cấp tầng';
  }
  if (form.layoutMode === 'single') {
    if (!form.vehicleTypeId) {
      errors.vehicleTypeId = 'Tầng 1 loại xe cần chọn loại xe';
    }
    const area = Number(form.areaM2);
    if (form.areaM2 === '' || form.areaM2 == null || Number.isNaN(area) || area <= 0) {
      errors.areaM2 = 'Tầng 1 loại xe cần diện tích tầng (m²) > 0';
    }
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

/** Validate form loại xe: bắt buộc tên + mã, diện tích 1 chỗ (m²) số ≥ 0 tùy chọn. */
export function validateVehicleTypeForm(form) {
  return mergeErrors(
    validateRequiredText(form.typeName, 'typeName', 'tên loại xe'),
    validateRequiredText(form.typeCode, 'typeCode', 'mã loại xe'),
    validateNonNegativeNumber(form.slotAreaM2, 'slotAreaM2', { required: false }),
  );
}

/**
 * Validate form chỗ đỗ (parking_slot): khu (bắt buộc). Mã chỗ do BE tự sinh nên không validate.
 * Khoảng cách tới cổng (tùy chọn, số ≥ 0). slotType tự do.
 */
export function validateSlotForm(form) {
  return mergeErrors(
    validateRequired(form.zoneId, 'zoneId', 'khu vực'),
    form.distanceToGate !== '' && form.distanceToGate != null
      ? validateNonNegativeNumber(form.distanceToGate, 'distanceToGate', { required: false })
      : {},
  );
}

/** Validate form khu vực (zone): tầng, loại xe, tên, số slot. Mã khu do BE tự sinh nên không validate. */
export function validateZoneForm(form) {
  return mergeErrors(
    validateRequired(form.floorId, 'floorId', 'tầng'),
    validateRequired(form.vehicleTypeId, 'vehicleTypeId', 'loại xe'),
    validateRequiredText(form.label, 'label', 'tên khu'),
    validateNonNegativeNumber(form.totalSlots, 'totalSlots'),
    form.monthlyPassCapacity !== '' && form.monthlyPassCapacity != null
      ? validateNonNegativeNumber(form.monthlyPassCapacity, 'monthlyPassCapacity', { required: false })
      : {},
  );
}

/** Validate form cổng (gate): tầng (bắt buộc), mã cổng (bắt buộc). */
export function validateGateForm(form) {
  return mergeErrors(
    validateRequired(form.floorId, 'floorId', 'tầng'),
    validateRequiredText(form.gateCode, 'gateCode', 'mã cổng'),
  );
}

/** Validate form check-in (Staff): biển số, loại xe, tầng. Cổng do BE tự suy (optional). */
export function validateCheckinForm(form) {
  return mergeErrors(
    validateRequiredText(form.plateNumber, 'plateNumber', 'biển số xe'),
    validateRequired(form.vehicleTypeId, 'vehicleTypeId', 'loại xe'),
    validateRequired(form.floorId, 'floorId', 'tầng'),
  );
}
