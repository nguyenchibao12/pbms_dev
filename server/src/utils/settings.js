import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Setting from '../models/setting.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '../config/building_config.json');

const DEFAULT_BUILDING = {
  building_name: 'Bãi đỗ PBMS',
  address: 'FPT University, Hà Nội',
  phone: '',
  is_24_7: false,
  open_time: '06:00',
  close_time: '22:00',
};

const DEFAULT_SCORE_WEIGHTS = {
  gate: 1,
  zone_balance: 0.5,
  slot_type: 0.2,
  preference: 0.25,
};

const DEFAULT_SYSTEM = {
  booking_fee: 20000,
  monthly_pass_price: 500000,
  lost_ticket_fee: 50000,
  // Phụ thu quá giờ (walk-in vượt max_parking_hours) — mặc định 0 = chưa áp dụng cho tới
  // khi Manager đặt giá. BE walk-in đọc qua getOverstayFee() khi enforce lúc checkout.
  overstay_fee: 0,
  slot_suggest_strategy: 'nearest_gate',
  suggest_score_weights: { ...DEFAULT_SCORE_WEIGHTS },
  ai_logging_enabled: true,
  max_parking_hours: null,
  // Hủy đặt chỗ confirmed trước giờ vào >= ngần này (giờ) → hoàn phí booking; sát giờ → không hoàn
  booking_refund_cutoff_hours: 1,
  // Đơn pending quá ngần này (phút) chưa thanh toán → job nền tự hủy + nhả slot (3.3)
  booking_pending_ttl_minutes: 15,
  // Đặt chỗ confirmed quá end_time + ngần này (phút) mà không check-in → no_show + nhả slot (3.3)
  booking_no_show_grace_minutes: 15,
  // Hủy vé tháng (P3-8): % hoàn theo mốc — trước start_date 100%; 3 ngày đầu hiệu lực 70%;
  // tới hết NỬA thời hạn 50%; quá nửa 0%. Deadline user cập nhật STK để nhận hoàn (ngày).
  pass_refund_trial_days: 3,
  pass_refund_trial_percent: 70,
  pass_refund_half_term_percent: 50,
  pass_refund_bank_info_ttl_days: 7,
};

let buildingCache = null;
let systemCache = null;

const readFileBuilding = () => {
  try {
    return { ...DEFAULT_BUILDING, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
  } catch {
    return { ...DEFAULT_BUILDING };
  }
};

const envSystemDefaults = () => ({
  booking_fee: Number(process.env.BOOKING_FEE) || DEFAULT_SYSTEM.booking_fee,
  monthly_pass_price: Number(process.env.MONTHLY_PASS_PRICE) || DEFAULT_SYSTEM.monthly_pass_price,
  lost_ticket_fee: Number(process.env.LOST_TICKET_FEE) || DEFAULT_SYSTEM.lost_ticket_fee,
  overstay_fee: Number(process.env.OVERSTAY_FEE) || DEFAULT_SYSTEM.overstay_fee,
  slot_suggest_strategy:
    process.env.SLOT_SUGGEST_STRATEGY === 'zone_balanced' ? 'zone_balanced' : 'nearest_gate',
  ai_logging_enabled: process.env.AI_LOGGING_ENABLED !== 'false',
  max_parking_hours: process.env.MAX_PARKING_HOURS ? Number(process.env.MAX_PARKING_HOURS) : null,
  booking_refund_cutoff_hours:
    process.env.BOOKING_REFUND_CUTOFF_HOURS != null && process.env.BOOKING_REFUND_CUTOFF_HOURS !== ''
      ? Number(process.env.BOOKING_REFUND_CUTOFF_HOURS)
      : DEFAULT_SYSTEM.booking_refund_cutoff_hours,
  booking_pending_ttl_minutes:
    process.env.BOOKING_PENDING_TTL_MINUTES != null && process.env.BOOKING_PENDING_TTL_MINUTES !== ''
      ? Number(process.env.BOOKING_PENDING_TTL_MINUTES)
      : DEFAULT_SYSTEM.booking_pending_ttl_minutes,
  booking_no_show_grace_minutes:
    process.env.BOOKING_NO_SHOW_GRACE_MINUTES != null &&
    process.env.BOOKING_NO_SHOW_GRACE_MINUTES !== ''
      ? Number(process.env.BOOKING_NO_SHOW_GRACE_MINUTES)
      : DEFAULT_SYSTEM.booking_no_show_grace_minutes,
  // Chính sách hoàn tiền vé tháng (Nhóm B) — đưa vào cache để GET /settings/system trả về
  // cho FE đổ form. getPassRefundPolicy() vẫn có fallback riêng nên an toàn hai chiều.
  pass_refund_trial_days: DEFAULT_SYSTEM.pass_refund_trial_days,
  pass_refund_trial_percent: DEFAULT_SYSTEM.pass_refund_trial_percent,
  pass_refund_half_term_percent: DEFAULT_SYSTEM.pass_refund_half_term_percent,
  pass_refund_bank_info_ttl_days: DEFAULT_SYSTEM.pass_refund_bank_info_ttl_days,
});

export const clearSettingsCache = () => {
  buildingCache = null;
  systemCache = null;
};

export const refreshSettingsCache = async () => {
  try {
    const row = await Setting.findByPk(1);
    if (row?.building_config) {
      buildingCache = { ...readFileBuilding(), ...JSON.parse(row.building_config) };
    } else {
      buildingCache = readFileBuilding();
    }
    if (row?.system_config) {
      systemCache = { ...envSystemDefaults(), ...JSON.parse(row.system_config) };
    } else {
      systemCache = envSystemDefaults();
    }
  } catch {
    buildingCache = readFileBuilding();
    systemCache = envSystemDefaults();
  }
  return { building: buildingCache, system: systemCache };
};

export const warmSettingsCache = async () => refreshSettingsCache();

export const getBuildingSettingsSync = () => buildingCache || readFileBuilding();

export const getSystemSettingsSync = () => systemCache || envSystemDefaults();

export const getBookingFee = () => Number(getSystemSettingsSync().booking_fee);

export const getMonthlyPassPrice = () => Number(getSystemSettingsSync().monthly_pass_price);

export const getLostTicketFee = () => Number(getSystemSettingsSync().lost_ticket_fee);

/** Phụ thu quá giờ (VND). BE walk-in gọi hàm này khi enforce phụ thu lúc checkout. */
export const getOverstayFee = () => {
  const v = getSystemSettingsSync().overstay_fee;
  return v != null && Number(v) >= 0 ? Number(v) : 0;
};

export const getSuggestStrategy = () => getSystemSettingsSync().slot_suggest_strategy || 'nearest_gate';

export const getSuggestScoreWeights = () => {
  const cfg = getSystemSettingsSync().suggest_score_weights;
  return { ...DEFAULT_SCORE_WEIGHTS, ...(cfg && typeof cfg === 'object' ? cfg : {}) };
};

export const isAiLoggingEnabledSync = () => Boolean(getSystemSettingsSync().ai_logging_enabled);

export const getMaxParkingHours = () => {
  const v = getSystemSettingsSync().max_parking_hours;
  return v != null && v > 0 ? Number(v) : null;
};

export const getBookingRefundCutoffHours = () => {
  const v = getSystemSettingsSync().booking_refund_cutoff_hours;
  return v != null && v >= 0 ? Number(v) : 1;
};

export const getBookingPendingTtlMinutes = () => {
  const v = getSystemSettingsSync().booking_pending_ttl_minutes;
  return v != null && v > 0 ? Number(v) : DEFAULT_SYSTEM.booking_pending_ttl_minutes;
};

export const getBookingNoShowGraceMinutes = () => {
  const v = getSystemSettingsSync().booking_no_show_grace_minutes;
  return v != null && v >= 0 ? Number(v) : DEFAULT_SYSTEM.booking_no_show_grace_minutes;
};

/** P3-8 — chính sách hoàn tiền hủy vé tháng (đọc từ settings, có default). */
export const getPassRefundPolicy = () => {
  const s = getSystemSettingsSync();
  const num = (v, dflt) => (v != null && Number(v) >= 0 ? Number(v) : dflt);
  return {
    trialDays: num(s.pass_refund_trial_days, DEFAULT_SYSTEM.pass_refund_trial_days),
    trialPercent: num(s.pass_refund_trial_percent, DEFAULT_SYSTEM.pass_refund_trial_percent),
    halfTermPercent: num(s.pass_refund_half_term_percent, DEFAULT_SYSTEM.pass_refund_half_term_percent),
    bankInfoTtlDays: num(s.pass_refund_bank_info_ttl_days, DEFAULT_SYSTEM.pass_refund_bank_info_ttl_days),
  };
};

export const getDefaultBuildingSettings = () => ({ ...readFileBuilding() });

export const getDefaultSystemSettings = () => ({ ...envSystemDefaults() });
