import Setting from '../models/setting.model.js';
import {
  getSystemSettingsSync,
  clearSettingsCache,
  refreshSettingsCache,
} from '../utils/settings.js';

/** Đọc cấu hình hệ thống hiện hành (từ cache đã warm sẵn). */
export const getSystemSettings = () => getSystemSettingsSync();

/**
 * Ghi partial vào Setting row id=1 (cột system_config JSON): merge với JSON cũ để KHÔNG
 * mất các key ngoài whitelist (vd suggest_score_weights, booking_* của BE khác). Sau khi
 * ghi thì làm mới cache để mọi getter đọc giá trị mới ngay (không cần restart).
 */
export const updateSystemSettings = async (patch) => {
  const row = await Setting.findByPk(1);
  const current = row?.system_config ? JSON.parse(row.system_config) : {};
  const merged = { ...current, ...patch };

  if (row) {
    await row.update({ system_config: JSON.stringify(merged) });
  } else {
    await Setting.create({ setting_id: 1, system_config: JSON.stringify(merged) });
  }

  clearSettingsCache();
  await refreshSettingsCache();
  return getSystemSettingsSync();
};
