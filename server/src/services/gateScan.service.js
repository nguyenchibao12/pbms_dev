import { Gate, Reservation, ParkingSession, MonthlyPass } from '../models/index.js';
import sequelize from '../config/db.js';
import { AppError } from '../utils/helpers.js';
import { checkinReservation } from './reservation.service.js';
import { checkinWithPass } from './monthlyPass.service.js';
import { initiateSessionCheckout } from './payment.service.js';
import { recordIncident } from './incident.service.js';
import { releaseSlotIfOccupied } from '../utils/slotSuggest.js';
import { assertReservationQrUsable } from '../utils/stateGuards.js';

const open = (stage, extra = {}) => ({ action: 'OPEN', stage, ...extra });

// Tra cứu QR → đặt chỗ / phiên đang gửi / vé tháng.
const resolveQr = async (qrToken) => {
  const token = String(qrToken || '').trim();
  if (!token || token.startsWith('revoked-')) {
    throw new AppError('Mã QR không hợp lệ hoặc đã vô hiệu', 400, 'VALIDATION_ERROR');
  }
  const reservation = await Reservation.findOne({ where: { qr_token: token } });
  if (reservation) {
    // OR-16: token gốc được giữ lại kể cả khi đơn đã hủy/no-show/xong → chặn theo status.
    assertReservationQrUsable(reservation);
    return { kind: 'reservation', reservation };
  }
  const session = await ParkingSession.findOne({ where: { qr_token: token, status: 'active' } });
  if (session) return { kind: 'session', session };
  const pass = await MonthlyPass.findOne({ where: { qr_token: token } });
  if (pass) {
    if (pass.status !== 'active') {
      throw new AppError(`Vé tháng không còn hiệu lực (trạng thái: ${pass.status})`, 409, 'CONFLICT');
    }
    // DATEONLY trả về chuỗi 'YYYY-MM-DD' → so sánh chuỗi theo ngày là đủ.
    const today = new Date().toISOString().slice(0, 10);
    if (today < String(pass.start_date) || today > String(pass.end_date)) {
      throw new AppError('Vé tháng ngoài thời hạn hiệu lực', 409, 'CONFLICT');
    }
    return { kind: 'pass', pass };
  }
  throw new AppError('Không tìm thấy đặt chỗ / phiên / vé tháng theo mã QR này', 404, 'NOT_FOUND');
};

// Phiên đang gửi tương ứng với mã QR (để xử lý lúc RA).
// Vé tháng cũng quy về phiên active theo pass_id → cả 4 cổng dùng lại máy trạng thái gate_stage.
const findActiveSession = async (ref) => {
  if (ref.kind === 'session') return ref.session;
  if (ref.kind === 'pass') {
    return ParkingSession.findOne({
      where: { pass_id: ref.pass.pass_id, status: 'active' },
    });
  }
  return ParkingSession.findOne({
    where: { reservation_id: ref.reservation.reservation_id, status: 'active' },
  });
};

// CỔNG IN TÒA (máy trạng thái gate_stage):
// - Đặt chỗ (chưa có phiên): check-in tại đây (tạo phiên + chiếm slot) → 'in_building'.
// - Vé tháng (chưa có phiên): check-in miễn phí tại đây (checkinWithPass) → 'in_building'.
// - Walk-in (phiên tạo ở booth, stage 'checked_in'): lần VÀO ĐẦU → 'in_building' + MỞ.
//   (Xe phải qua cổng tòa mới vào trong để lên tầng — không thể bỏ qua.)
// CHẶN VÀO LẠI: phiên đã qua 'checked_in' (đã vào rồi) → KHÔNG mở lần nữa.
const buildingEntry = async (ref, gate) => {
  const existing = await findActiveSession(ref);
  if (existing) {
    if (existing.gate_stage !== 'checked_in') {
      throw new AppError(
        'Xe đã vào bãi — không thể mở cổng vào lần nữa.',
        409,
        'ALREADY_PARKED',
      );
    }
    // Phiên do staff tạo ở booth (walk-in) — lần vào ĐẦU: tiến trạng thái + mở.
    await ParkingSession.update(
      { gate_stage: 'in_building' },
      { where: { session_id: existing.session_id, gate_stage: 'checked_in' } },
    );
    return open('building-in', {
      kind: existing.reservation_id ? 'reservation' : existing.pass_id ? 'pass' : 'session',
      sessionId: existing.session_id,
    });
  }

  // Vé tháng chưa có phiên → check-in ngay tại cổng tòa (trong khung giờ; ngoài khung
  // giờ checkinWithPass chặn 409 PASS_OUTSIDE_WINDOW, hướng dẫn qua booth).
  if (ref.kind === 'pass') {
    const session = await checkinWithPass(ref.pass, { gateId: gate.gate_id });
    // Vừa qua cổng tòa → 'in_building' (lần quét cổng tòa sau sẽ bị chặn vào lại).
    await ParkingSession.update(
      { gate_stage: 'in_building' },
      { where: { session_id: session.session_id } },
    );
    return open('building-in', {
      kind: 'pass',
      sessionId: session.session_id,
      slotId: session.slot_id,
    });
  }

  // Chưa có phiên -> chỉ hợp lệ với QR ĐẶT CHỖ chưa check-in.
  if (ref.kind !== 'reservation') {
    throw new AppError('Mã không hợp lệ cho cổng vào tòa', 409, 'CONFLICT');
  }
  const r = ref.reservation;
  if (r.status === 'cancelled') throw new AppError('Đặt chỗ đã bị hủy', 409, 'CONFLICT');
  if (r.status === 'pending') throw new AppError('Đặt chỗ chưa thanh toán', 409, 'CONFLICT');

  // checkinReservation tự suy cổng tầng IN đúng tầng đã đặt (tạo phiên + chiếm slot).
  const result = await checkinReservation(r.user_id, { reservationId: r.reservation_id });
  // Vừa qua cổng tòa → 'in_building' (lần quét cổng tòa sau sẽ bị chặn vào lại).
  await ParkingSession.update(
    { gate_stage: 'in_building' },
    { where: { session_id: result.session.session_id } },
  );
  return open('building-in', {
    kind: 'reservation',
    sessionId: result.session.session_id,
    slotId: result.session.slot_id,
    info: result,
  });
};

// CỔNG IN TẦNG: yêu cầu đã VÀO TÒA ('in_building'), đúng tầng → tiến 'on_floor' rồi mở.
const floorEntry = async (ref, gate) => {
  const ses = await findActiveSession(ref);
  if (!ses) {
    throw new AppError('Chưa có phiên đang gửi — vui lòng quét ở CỔNG VÀO TÒA trước.', 409, 'CONFLICT');
  }
  const session = await ParkingSession.findByPk(ses.session_id, {
    include: [{ association: 'slot', include: [{ association: 'zone' }] }],
  });
  // Phải qua CỔNG TÒA trước (chống vào tầng khi chưa vào tòa).
  if (session.gate_stage === 'checked_in') {
    throw new AppError('Chưa vào tòa — vui lòng quét CỔNG VÀO TÒA trước. Barrier không mở.', 409, 'NOT_IN_BUILDING');
  }
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
  // Tiến 'in_building' -> 'on_floor' (idempotent: quét lại khi đã on_floor vẫn mở).
  if (session.gate_stage === 'in_building') {
    await ParkingSession.update(
      { gate_stage: 'on_floor' },
      { where: { session_id: session.session_id, gate_stage: 'in_building' } },
    );
  }
  return open('floor-in', { sessionId: session.session_id, alreadyIn: true });
};

// CỔNG OUT TẦNG: xe rời tầng → CHỐT mốc tính phí (left_floor_at) rồi mở.
// Phí sẽ tính từ time_in tới mốc này; phần đi từ tầng ra cổng tòa không tính tiền.
// Giải phóng slot + đóng phiên vẫn dồn về cổng OUT tòa (1 điểm chốt).
const floorExit = async (ref, gate) => {
  const base = await findActiveSession(ref);
  if (!base) throw new AppError('Không có phiên đang gửi cho mã QR này', 404, 'NOT_FOUND');
  // Phải RA đúng cổng tầng nơi xe đang đỗ — chống dùng mã ở cổng tầng KHÁC để mở/chốt phí.
  const session = await ParkingSession.findByPk(base.session_id, {
    include: [{ association: 'slot', include: [{ association: 'zone' }] }],
  });
  const sessionFloorId = session?.slot?.zone?.floor_id ?? null;
  if (sessionFloorId && gate.floor_id != null && gate.floor_id !== sessionFloorId) {
    await recordIncident({
      type: 'wrong_floor',
      description: `QR sai tầng tại cổng RA tầng: cổng tầng ${gate.floor_id}, slot ở tầng ${sessionFloorId}`,
      sessionId: session.session_id,
      slotId: session.slot_id,
      userId: session.user_id,
    });
    throw new AppError('Sai tầng — mã không thuộc tầng của cổng này. Barrier không mở.', 403, 'WRONG_FLOOR');
  }
  // Phải đã VÀO TẦNG ('on_floor') mới được ra tầng — chống "ra tầng chưa từng vào".
  if (session.gate_stage !== 'on_floor') {
    throw new AppError(
      'Xe chưa vào tầng (chưa quét cổng tầng VÀO) — không thể quét cổng tầng RA.',
      409,
      'NOT_ON_FLOOR',
    );
  }
  // Lần ĐẦU rời tầng: tiến 'left_floor' + ghi mốc phí + NHẢ SLOT NGAY.
  // Atomic qua WHERE gate_stage='on_floor' -> chỉ chạy đúng 1 lần; quét lại không nhả nhầm slot.
  await sequelize.transaction(async (transaction) => {
    const [affected] = await ParkingSession.update(
      { gate_stage: 'left_floor', left_floor_at: new Date() },
      { where: { session_id: session.session_id, gate_stage: 'on_floor' }, transaction },
    );
    if (affected > 0) {
      await releaseSlotIfOccupied(session.slot_id, transaction);
    }
  });
  return open('floor-out', { sessionId: session.session_id });
};

// CỔNG OUT TÒA: checkout + tính phí (tái dùng initiateSessionCheckout).
// Cho ra khi: 'left_floor' (rời tầng bình thường) HOẶC 'in_building' (vào tòa nhưng ĐỔI Ý
// ra sớm, chưa lên tầng — không bắt lái lên tầng rồi vòng xuống).
// CHẶN: 'on_floor' (đang trên tầng → phải quét CỔNG TẦNG RA trước khi xuống) và
//       'checked_in' (chưa thực sự vào tòa).
const buildingExit = async (ref, gate) => {
  const session = await findActiveSession(ref);
  if (!session) throw new AppError('Không có phiên đang gửi cho mã QR này', 404, 'NOT_FOUND');
  if (session.gate_stage === 'checked_in') {
    throw new AppError('Xe chưa vào tòa — chưa thể ra cổng tòa.', 409, 'NOT_IN_BUILDING');
  }
  if (session.gate_stage === 'on_floor') {
    throw new AppError(
      'Xe đang trên tầng — vui lòng quét CỔNG TẦNG RA trước khi ra cổng tòa.',
      409,
      'NOT_LEFT_FLOOR',
    );
  }
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
/**
 * Điều phối máy trạng thái cổng — 2 câu hỏi (tòa/tầng × vào/ra) ra 4 nhánh dưới.
 * Phiên đi đúng thứ tự checked_in → in_building → on_floor → left_floor → exited; nhảy cóc né phí bị chặn.
 */
export const scanGate = async ({ qrToken, gateId }) => {
  const gate = await Gate.findByPk(gateId);
  if (!gate || !gate.is_active) {
    throw new AppError('Cổng không tồn tại hoặc đang bảo trì', 404, 'NOT_FOUND');
  }
  const isBuilding = gate.floor_id == null;            // NULL = cổng cấp TÒA (không phải "chưa gán tầng")
  // QR có thể là phiên / đơn đặt chỗ / vé tháng → chuẩn hóa về 1 "ref" để 4 nhánh khỏi tự phân loại.
  const ref = await resolveQr(qrToken);

  if (gate.direction === 'in') {
    return isBuilding ? buildingEntry(ref, gate) : floorEntry(ref, gate);
  }
  return isBuilding ? buildingExit(ref, gate) : floorExit(ref, gate);
};

/**
 * KIOSK POLL — trạng thái RA của 1 phiên (theo sessionId, không cần QR).
 * Màn cổng OUT sau khi hiện PAYMENT_REQUIRED sẽ poll cái này; phiên 'completed'
 * (do staff thu tiền mặt HOẶC PayOS xác nhận) → kiosk tự mở barie. Đồng bộ 2 cách trả.
 */
export const getExitStatus = async (sessionId) => {
  const id = Number(sessionId);
  if (!Number.isInteger(id) || id < 1) {
    throw new AppError('sessionId không hợp lệ', 400, 'VALIDATION_ERROR');
  }
  const session = await ParkingSession.findByPk(id);
  if (!session) throw new AppError('Không tìm thấy phiên', 404, 'NOT_FOUND');
  return {
    sessionId: session.session_id,
    paid: session.status === 'completed',
    status: session.status,
    fee: session.calculated_fee != null ? Number(session.calculated_fee) : null,
  };
};
