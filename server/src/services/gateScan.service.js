import { Gate, Reservation, ParkingSession } from '../models/index.js';
import { AppError } from '../utils/helpers.js';
import { checkinReservation } from './reservation.service.js';
import { initiateSessionCheckout } from './payment.service.js';
import { recordIncident } from './incident.service.js';

// LƯU Ý: bản này CHƯA hỗ trợ check-in vé tháng ở cổng (pbms_dev chưa có checkinWithPass).
// Khi monthlyPass.service có hàm check-in, bổ sung nhánh 'pass' tương tự nhánh 'reservation'.

const open = (stage, extra = {}) => ({ action: 'OPEN', stage, ...extra });

// Tra cứu QR → đặt chỗ / phiên đang gửi.
const resolveQr = async (qrToken) => {
  const token = String(qrToken || '').trim();
  if (!token || token.startsWith('revoked-')) {
    throw new AppError('Mã QR không hợp lệ hoặc đã vô hiệu', 400, 'VALIDATION_ERROR');
  }
  const reservation = await Reservation.findOne({ where: { qr_token: token } });
  if (reservation) return { kind: 'reservation', reservation };
  const session = await ParkingSession.findOne({ where: { qr_token: token, status: 'active' } });
  if (session) return { kind: 'session', session };
  throw new AppError('Không tìm thấy đặt chỗ / phiên theo mã QR này', 404, 'NOT_FOUND');
};

// Phiên đang gửi tương ứng với mã QR (để xử lý lúc RA).
const findActiveSession = async (ref) => {
  if (ref.kind === 'session') return ref.session;
  return ParkingSession.findOne({
    where: { reservation_id: ref.reservation.reservation_id, status: 'active' },
  });
};

// CỔNG IN TÒA: chỉ kiểm tra QR hợp lệ rồi mở — chưa tạo phiên.
const validateBuildingEntry = (ref) => {
  if (ref.kind === 'reservation') {
    const r = ref.reservation;
    if (r.status === 'cancelled') throw new AppError('Đặt chỗ đã bị hủy', 409, 'CONFLICT');
    if (r.status === 'pending') throw new AppError('Đặt chỗ chưa thanh toán', 409, 'CONFLICT');
    return open('building-in', { kind: 'reservation', reservationId: r.reservation_id });
  }
  return open('building-in', { kind: 'session', sessionId: ref.session.session_id });
};

// CỔNG IN TẦNG: check-in thật (tạo phiên, chiếm slot) — tái dùng service sẵn có.
const floorCheckin = async (ref, gate) => {
  if (ref.kind === 'reservation') {
    const result = await checkinReservation(ref.reservation.user_id, {
      gateId: gate.gate_id,
      qrToken: ref.reservation.qr_token,
    });
    return open('floor-in', { kind: 'reservation', info: result });
  }
  // QR phiên walk-in đã active → cổng IN phải đúng tầng của slot đã gán mới mở (idempotent).
  const session = await ParkingSession.findByPk(ref.session.session_id, {
    include: [{ association: 'slot', include: [{ association: 'zone' }] }],
  });
  const sessionFloorId = session?.slot?.zone?.floor_id ?? null;
  if (sessionFloorId && gate.floor_id != null && gate.floor_id !== sessionFloorId) {
    await recordIncident({
      type: 'wrong_floor',
      description: `Walk-in QR sai tầng tại cổng vào: cổng tầng ${gate.floor_id}, slot ở tầng ${sessionFloorId}`,
      sessionId: session.session_id,
      slotId: session.slot_id,
      userId: session.user_id,
    });
    throw new AppError('Sai tầng — mã không thuộc tầng của cổng này. Barrier không mở.', 403, 'WRONG_FLOOR');
  }
  return open('floor-in', { kind: 'session', sessionId: session.session_id, alreadyIn: true });
};

// CỔNG OUT TẦNG: chỉ xác nhận có phiên + mở (xe rời tầng). Không đổi trạng thái.
// Giải phóng slot + đóng phiên dồn về cổng OUT tòa (1 điểm chốt) để tránh kẽ hở.
const floorExit = async (ref) => {
  const session = await findActiveSession(ref);
  if (!session) throw new AppError('Không có phiên đang gửi cho mã QR này', 404, 'NOT_FOUND');
  return open('floor-out', { sessionId: session.session_id });
};

// CỔNG OUT TÒA: checkout + tính phí (tái dùng initiateSessionCheckout).
const buildingExit = async (ref, gate) => {
  const session = await findActiveSession(ref);
  if (!session) throw new AppError('Không có phiên đang gửi cho mã QR này', 404, 'NOT_FOUND');
  const actorId = session.user_id ?? session.check_in_by;
  const result = await initiateSessionCheckout(actorId, {
    sessionId: session.session_id,
    gateId: gate.gate_id,
  });
  const fee = Number(result.fee) || 0;
  if (result.checkoutUrl && fee > 0) {
    return {
      action: 'PAYMENT_REQUIRED',
      stage: 'building-out',
      fee,
      checkoutUrl: result.checkoutUrl,
      sessionId: session.session_id,
    };
  }
  return open('building-out', { fee, sessionId: session.session_id, info: result });
};

/**
 * Quét QR tại một cổng → tự quyết hành động theo (cổng tòa/tầng) + (in/out).
 * Trả { action: OPEN | PAYMENT_REQUIRED, stage, ... }.
 */
export const scanGate = async ({ qrToken, gateId }) => {
  const gate = await Gate.findByPk(gateId);
  if (!gate || !gate.is_active) {
    throw new AppError('Cổng không tồn tại hoặc đang bảo trì', 404, 'NOT_FOUND');
  }
  const isBuilding = gate.floor_id == null;
  const ref = await resolveQr(qrToken);

  if (gate.direction === 'in') {
    return isBuilding ? validateBuildingEntry(ref) : floorCheckin(ref, gate);
  }
  return isBuilding ? buildingExit(ref, gate) : floorExit(ref);
};
