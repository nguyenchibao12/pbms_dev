import { INCIDENT_TYPES, INCIDENT_STATUSES, FEEDBACK_CATEGORIES } from '../models/incident.model.js';
import { SESSION_TYPES, SESSION_STATUSES } from '../models/parkingSession.model.js';
import { SLOT_STATUSES } from '../models/parkingSlot.model.js';
import { PAYMENT_STATUSES } from '../models/payment.model.js';
import { RESERVATION_STATUSES } from '../models/reservation.model.js';

export const INCIDENT_TYPE_LABELS = {
  wrong_floor: 'Sai tầng',
  duplicate_session: 'Trùng phiên',
  window_violation: 'Vi phạm khung giờ',
  slot_conflict: 'Xung đột slot',
  lost_ticket: 'Mất thẻ',
  wrong_info: 'Sai thông tin xe',
  overstay: 'Quá hạn gửi',
  wrong_zone: 'Sai khu vực',
  feedback: 'Phản hồi khách',
  other: 'Khác',
};

export const INCIDENT_STATUS_LABELS = {
  open: 'Mới',
  investigating: 'Đang xử lý',
  resolved: 'Đã xử lý',
};

export const FEEDBACK_CATEGORY_LABELS = {
  lost_card: 'Mất thẻ / QR',
  wrong_fee: 'Sai phí',
  hard_to_find: 'Khó tìm xe',
  slot_taken: 'Slot bị chiếm',
  other: 'Khác',
};

export const SESSION_TYPE_LABELS = {
  walk_in: 'Walk-in',
  reservation: 'Đặt chỗ',
  monthly_pass: 'Vé tháng',
  auto_registered: 'Tự động',
};

export const SESSION_STATUS_LABELS = {
  active: 'Đang active',
  completed: 'Hoàn tất',
  exception: 'Ngoại lệ',
};

export const SLOT_STATUS_LABELS = {
  available: 'Trống',
  reserved: 'Đã đặt',
  occupied: 'Đang dùng',
  maintenance: 'Bảo trì',
  locked: 'Tạm khóa',
};

export const PAYMENT_STATUS_LABELS = {
  pending: 'Chờ thanh toán',
  success: 'Thành công',
  failed: 'Thất bại',
  refunded: 'Đã hoàn',
};

export const RESERVATION_STATUS_LABELS = {
  pending: 'Chờ thanh toán',
  confirmed: 'Đã xác nhận',
  checked_in: 'Đã check-in',
  completed: 'Hoàn tất',
  cancelled: 'Đã hủy',
  no_show: 'Không đến',
  expired: 'Hết hạn',
};

export const MANUAL_SLOT_STATUSES = ['available', 'maintenance', 'locked'];

export const STAFF_CREATABLE_INCIDENT_TYPES = [
  'lost_ticket',
  'wrong_info',
  'overstay',
  'wrong_zone',
  'other',
];

const toOptions = (values, labels) =>
  values.map((value) => ({ value, label: labels[value] || value }));

export const buildEnumPayload = () => ({
  incidentTypes: toOptions(INCIDENT_TYPES, INCIDENT_TYPE_LABELS),
  incidentStatuses: toOptions(INCIDENT_STATUSES, INCIDENT_STATUS_LABELS),
  feedbackCategories: toOptions(FEEDBACK_CATEGORIES, FEEDBACK_CATEGORY_LABELS),
  staffIncidentTypes: toOptions(STAFF_CREATABLE_INCIDENT_TYPES, INCIDENT_TYPE_LABELS),
  sessionTypes: toOptions(SESSION_TYPES, SESSION_TYPE_LABELS),
  sessionStatuses: toOptions(SESSION_STATUSES, SESSION_STATUS_LABELS),
  slotStatuses: toOptions(SLOT_STATUSES, SLOT_STATUS_LABELS),
  paymentStatuses: toOptions(PAYMENT_STATUSES, PAYMENT_STATUS_LABELS),
  reservationStatuses: toOptions(RESERVATION_STATUSES, RESERVATION_STATUS_LABELS),
  manualSlotStatuses: toOptions(MANUAL_SLOT_STATUSES, SLOT_STATUS_LABELS),
});

export const enrichIncident = (incident) => {
  const row = incident.toJSON ? incident.toJSON() : { ...incident };
  return {
    ...row,
    typeLabel: INCIDENT_TYPE_LABELS[row.type] || row.type,
    statusLabel: INCIDENT_STATUS_LABELS[row.status] || row.status,
    categoryLabel: row.category ? FEEDBACK_CATEGORY_LABELS[row.category] : null,
  };
};
