import { asyncHandler, successResponse } from '../utils/helpers.js';
import * as settingsService from '../services/settings.service.js';
import { SYSTEM_FIELD_KEYS } from '../validators/settings.validator.js';

export const getSystem = asyncHandler(async (req, res) => {
  successResponse(res, settingsService.getSystemSettings(), 'Cấu hình hệ thống');
});

export const updateSystem = asyncHandler(async (req, res) => {
  // Chỉ nhặt các key trong whitelist (kể cả null cho max_parking_hours) — bỏ mọi key lạ.
  const patch = {};
  for (const key of SYSTEM_FIELD_KEYS) {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) patch[key] = req.body[key];
  }
  const updated = await settingsService.updateSystemSettings(patch);
  successResponse(res, updated, 'Đã cập nhật cấu hình hệ thống');
});
