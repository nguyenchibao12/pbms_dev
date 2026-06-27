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

// CỔNG IN TÒA: TẠO PHIÊN + chiếm slot NGAY tại cổng vào tòa (yêu cầu nghiệp vụ).
// Khách đặt chỗ: check-in thật ở đây (chiếm slot đã đặt). Walk-in: phiên đã do staff
// tạo sẵn nên chỉ mở. Phiên đã active rồi -> idempotent, chỉ mở.
const buildingEntry = async (ref) => {
  if (ref.kind !== 'reservation') {
    return open('building-in', { kind: 'session', sessionId: ref.session.session_id });
  }

  const r = ref.reservation;
  if (r.status === 'cancelled') throw new AppError('Đặt chỗ đã bị hủy', 409, 'CONFLICT');
  if (r.status === 'pending') throw new AppError('Đặt chỗ chưa thanh toán', 409, 'CONFLICT');

  const existing = await ParkingSession.findOne({
    where: { reservation_id: r.reservation_id, status: 'active' },
  });
  if (existing) {
    return open('building-in', {
      kind: 'reservation',
      sessionId: existing.session_id,
      alreadyIn: true,
    });
  }

  // checkinReservation không nhận gateId -> tự suy cổng tầng IN đúng tầng đã đặt
  // (không truyền cổng TÒA vì nó sẽ bị coi là "sai tầng").
  const result = await checkinReservation(r.user_id, { reservationId: r.reservation_id });
  return open('building-in', {
    kind: 'reservation',
    sessionId: result.session.session_id,
    slotId: result.session.slot_id,
    info: result,
  });
};

// CỔNG IN TẦNG: phiên đã tạo ở cổng tòa → chỉ xác nhận slot đúng tầng rồi mở (idempotent).
const floorEntry = async (ref, gate) => {
  const ses = await findActiveSession(ref);
  if (!ses) {
    throw new AppError('Chưa có phiên đang gửi — vui lòng quét ở CỔNG VÀO TÒA trước.', 409, 'CONFLICT');
  }
  const session = await ParkingSession.findByPk(ses.session_id, {
    include: [{ association: 'slot', include: [{ association: 'zone' }] }],
  });
  const sessionFloorId = session?.slot?.zone?.floor_id ?? null;
  if (sessionFloorId && gate.floor_id != null && gate.floor_id !== sessionFloorId) {
    await recordIncident({
      type: 'wrong_floor',
      description: `QR sai tầng tại cổng vào tầng: cổng tầng ${gate.floor_id}, slot ở tầng ${sessionFloorId}`,
      sessionId: session.session_id,
      slotId: session.slot_id,
      userId: session.user_id,
    });
    throw new AppError('Sai tầng — mã không thuộc tầng của cổng này. Barrier không mở.', 403, 'WRONG_FLOOR');
  }
  return open('floor-in', { sessionId: session.session_id, alreadyIn: true });
};

// CỔNG OUT TẦNG: xe rời tầng → CHỐT mốc tính phí (left_floor_at) rồi mở.
// Phí sẽ tính từ time_in tới mốc này; phần đi từ tầng ra cổng tòa không tính tiền.
// Giải phóng slot + đóng phiên vẫn dồn về cổng OUT tòa (1 điểm chốt).
const floorExit = async (ref) => {
  const session = await findActiveSession(ref);
  if (!session) throw new AppError('Không có phiên đang gửi cho mã QR này', 404, 'NOT_FOUND');
  // Ghi mốc rời tầng 1 lần duy nhất (idempotent qua điều kiện left_floor_at: null).
  if (!session.left_floor_at) {
    await ParkingSession.update(
      { left_floor_at: new Date() },
      { where: { session_id: session.session_id, left_floor_at: null } },
    );
  }
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
    // Kiosk CÔNG KHAI (không đăng nhập) → PayOS hủy/return phải về lại trang kiosk,
    // KHÔNG về /staff (trang cần login, sẽ bị đá ra /login).
    returnUrl: `${process.env.CLIENT_URL}/kiosk/gate`,
    cancelUrl: `${process.env.CLIENT_URL}/kiosk/gate`,
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
    return isBuilding ? buildingEntry(ref) : floorEntry(ref, gate);
  }
  return isBuilding ? buildingExit(ref, gate) : floorExit(ref);
};
