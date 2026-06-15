import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AppError } from './helpers.js';
import { getBuildingSettingsSync } from './settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '../config/building_config.json');

const parseHm = (value) => {
  const [h, m] = String(value).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const getBuildingConfig = () => getBuildingSettingsSync();

export const getBuildingHours = () => {
  const cfg = getBuildingSettingsSync();
  if (cfg.is_24_7) {
    return { is24_7: true, openMinutes: 0, closeMinutes: 24 * 60 - 1 };
  }

  const openStr = cfg.open_time || process.env.BUILDING_OPEN_TIME || '06:00';
  const closeStr = cfg.close_time || process.env.BUILDING_CLOSE_TIME || '22:00';

  const envHours = process.env.BUILDING_OPEN_HOURS;
  if (envHours && !cfg.open_time) {
    const match = envHours.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
    if (match) {
      return {
        is24_7: false,
        openMinutes: parseHm(match[1]),
        closeMinutes: parseHm(match[2]),
      };
    }
  }

  return {
    is24_7: false,
    openMinutes: parseHm(openStr),
    closeMinutes: parseHm(closeStr),
  };
};

/** DV-14 — chặn check-in mới ngoài giờ mở cửa */
export const assertBuildingOpenForCheckIn = (dateTime = new Date()) => {
  const { is24_7, openMinutes, closeMinutes } = getBuildingHours();
  if (is24_7) return;

  const minutes = dateTime.getHours() * 60 + dateTime.getMinutes();
  if (minutes < openMinutes || minutes > closeMinutes) {
    const cfg = getBuildingSettingsSync();
    const label = `${cfg.open_time || '06:00'} – ${cfg.close_time || '22:00'}`;
    throw new AppError(
      `Bãi đỗ đóng cửa. Giờ mở cửa: ${label} (DV-14)`,
      409,
      'BUILDING_CLOSED',
    );
  }
};
