import Setting from '../models/setting.model.js';
import {
  getSystemSettingsSync,
  clearSettingsCache,
  refreshSettingsCache,
} from '../utils/settings.js';

/** Đọc cấu hình hệ thống hiện hành (từ cache đã warm sẵn). */
export const getSystemSettings = () => getSystemSettingsSync();

/**
 * Ghi partial vào Setting row id=1 (system_config JSON) → hiệu lực NGAY, không cần restart.
 * Chỉ lưu field đã đổi; phần còn lại vẫn rơi về env/mặc định của `envSystemDefaults()`.
 */
export const updateSystemSettings = async (patch) => {
  const row = await Setting.findByPk(1);              // toàn hệ thống chỉ 1 row cấu hình (id = 1)
  const current = row?.system_config ? JSON.parse(row.system_config) : {};
  // MERGE chứ không ghi đè cả cụm: giữ nguyên key ngoài whitelist (suggest_score_weights,
  // booking_* của BE khác) — PATCH 1 field không được xóa mất phần người khác đã cấu hình.
  const merged = { ...current, ...patch };

  if (row) {
    await row.update({ system_config: JSON.stringify(merged) });
  } else {
    await Setting.create({ setting_id: 1, system_config: JSON.stringify(merged) });   // lần đầu
  }

  // Ghi DB xong PHẢI làm mới cache, không thì getter vẫn trả số cũ tới khi restart.
  clearSettingsCache();
  await refreshSettingsCache();
  return getSystemSettingsSync();
};
