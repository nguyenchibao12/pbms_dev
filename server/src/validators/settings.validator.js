import { body } from 'express-validator';

/**
 * Whitelist field Manager được sửa trong system_config (Nhóm A + B).
 * Controller CHỈ ghi các key này (bỏ mọi key lạ client gửi kèm).
 *  - A (giá/giới hạn): booking_fee, monthly_pass_price, lost_ticket_fee, overstay_fee, max_parking_hours
 *  - B (chính sách hoàn tiền vé tháng): pass_refund_*
 *  - C1 (chính sách hoàn tiền ĐẶT CHỖ): booking_refund_cutoff_hours, booking_refund_percent
 * Phần còn lại Nhóm C (booking_* vòng đời khác) và D (AI suggest) CHƯA mở — xem handoff.
 */
export const SYSTEM_FIELD_KEYS = [
  'booking_fee',
  'monthly_pass_price',
  'lost_ticket_fee',
  'overstay_fee',
  'max_parking_hours',
  'booking_refund_cutoff_hours',
  'booking_refund_percent',
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
  // max_parking_hours: null/bỏ trống = không giới hạn; hoặc số > 0 (CHO PHÉP LẺ để hỗ trợ đơn vị
  // nhỏ hơn giờ — FE gửi GIỜ đã quy đổi, vd chọn "Phút" nhập 90 → 1.5). Consumer nhân giờ×3.6e6 ms
  // nên số lẻ chạy đúng (1.5 → 90 phút). Trước đây ép số nguyên ≥ 1 nên không đặt được 30/90 phút.
  body('max_parking_hours')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .custom((v) => v === null || (Number.isFinite(Number(v)) && Number(v) > 0))
    .withMessage('Giờ gửi tối đa phải là số > 0 (cho phép lẻ) hoặc bỏ trống (không giới hạn)'),
  // C1 — chính sách hoàn tiền ĐẶT CHỖ (đơn giữ chỗ): mốc giờ cutoff + % hoàn trước cutoff.
  body('booking_refund_cutoff_hours')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Mốc giờ hoàn (trước giờ vào) phải là số ≥ 0')
    .toFloat(),
  percent('booking_refund_percent', '% hoàn phí giữ chỗ'),
  intMin0('pass_refund_trial_days', 'Số ngày đầu ưu đãi hoàn tiền'),
  percent('pass_refund_trial_percent', '% hoàn 3 ngày đầu'),
  percent('pass_refund_half_term_percent', '% hoàn tới nửa hạn'),
  intMin0('pass_refund_bank_info_ttl_days', 'Hạn cập nhật STK (ngày)'),
];
