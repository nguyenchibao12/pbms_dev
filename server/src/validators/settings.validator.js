import { body } from 'express-validator';

/**
 * Whitelist field Manager được sửa trong system_config (Nhóm A + B).
 * Controller CHỈ ghi các key này (bỏ mọi key lạ client gửi kèm).
 *  - A (giá/giới hạn): booking_fee, monthly_pass_price, lost_ticket_fee, overstay_fee, max_parking_hours
 *  - B (chính sách hoàn tiền vé tháng): pass_refund_*
 * Nhóm C (booking_* vòng đời đặt chỗ) và D (AI suggest) CHƯA mở — xem handoff.
 */
export const SYSTEM_FIELD_KEYS = [
  'booking_fee',
  'monthly_pass_price',
  'lost_ticket_fee',
  'overstay_fee',
  'max_parking_hours',
  'pass_refund_trial_days',
  'pass_refund_trial_percent',
  'pass_refund_half_term_percent',
  'pass_refund_bank_info_ttl_days',
];

const money = (field, label) =>
  body(field).optional().isFloat({ min: 0 }).withMessage(`${label} phải là số ≥ 0`).toFloat();

const intMin0 = (field, label) =>
  body(field).optional().isInt({ min: 0 }).withMessage(`${label} phải là số nguyên ≥ 0`).toInt();

const percent = (field, label) =>
  body(field).optional().isInt({ min: 0, max: 100 }).withMessage(`${label} phải trong 0..100`).toInt();

export const updateSystemValidator = [
  money('booking_fee', 'Phí đặt chỗ'),
  money('monthly_pass_price', 'Giá vé tháng'),
  money('lost_ticket_fee', 'Phí mất vé'),
  money('overstay_fee', 'Phụ thu quá giờ'),
  // max_parking_hours: null/bỏ trống = không giới hạn; hoặc số nguyên ≥ 1.
  body('max_parking_hours')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .custom((v) => v === null || (Number.isInteger(Number(v)) && Number(v) >= 1))
    .withMessage('Số giờ gửi tối đa phải là số nguyên ≥ 1 hoặc bỏ trống (không giới hạn)'),
  intMin0('pass_refund_trial_days', 'Số ngày đầu ưu đãi hoàn tiền'),
  percent('pass_refund_trial_percent', '% hoàn 3 ngày đầu'),
  percent('pass_refund_half_term_percent', '% hoàn tới nửa hạn'),
  intMin0('pass_refund_bank_info_ttl_days', 'Hạn cập nhật STK (ngày)'),
];
