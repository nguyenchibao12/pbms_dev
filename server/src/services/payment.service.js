import sequelize from '../config/db.js';
import { Payment, ParkingSession, Gate } from '../models/index.js';
import { AppError } from '../utils/helpers.js';
import { releaseSlot } from '../utils/slotSuggest.js';
import { assertGateVehicleType } from '../utils/gateVehicle.js';
import { resolveFloorGate } from '../utils/gateResolve.js';
import {
  createPayOSPaymentLink,
  generateOrderCode,
  getPayOSPaymentInfo,
  verifyPayOSWebhook,
} from './payos.client.js';
import { previewCheckoutFee, getSession } from './session.service.js';
import {
  confirmReservationAfterPayment,
  cancelReservationOnPaymentFail,
  markReservationCompleted,
} from './reservation.service.js';
// monthlyPass.service nạp ĐỘNG (dynamic import) bên dưới — module vé tháng lên sau, payment
// vẫn chạy với session + reservation; nhánh vé tháng tự hoạt động khi file đó có mặt.
import {
  assertSessionActive,
  assertSessionCheckoutTime,
  buildRevokedQrToken,
} from '../utils/stateGuards.js';
import { getLostTicketFee } from '../utils/settings.js';
import { createIncident, recordIncident, reportOverstayCharge } from './incident.service.js';

const paymentIncludes = [
  { association: 'session', include: [{ association: 'slot' }] },
  { association: 'reservation', include: [{ association: 'slot' }] },
  { association: 'monthlyPass' },
];

export const getPayment = async (id) => {
  const payment = await Payment.findByPk(id, { include: paymentIncludes });
  if (!payment) throw new AppError('Payment not found', 404, 'NOT_FOUND');
  return payment;
};

export const getPaymentByOrderCode = async (orderCode) => {
  const payment = await Payment.findOne({
    where: { order_code: orderCode },
    include: paymentIncludes,
  });
  if (!payment) throw new AppError('Payment not found', 404, 'NOT_FOUND');
  return payment;
};

export const completeSessionAfterPayment = async (payment, staffUserId = null) => {
  if (payment.status === 'success') {
    const session = await getSession(payment.session_id);
    return { barrierOpened: true, session, payment, alreadyCompleted: true };
  }

  const session = await ParkingSession.findByPk(payment.session_id);
  if (!session) throw new AppError('Session not found', 404, 'NOT_FOUND');
  assertSessionActive(session);

  // time_out chốt theo mốc rời tầng (cổng tầng OUT) nếu có — khớp với phí đã tính.
  const timeOut = session.left_floor_at ? new Date(session.left_floor_at) : new Date();
  assertSessionCheckoutTime(session.time_in, timeOut);
  const fee = Number(payment.amount);

  await sequelize.transaction(async (transaction) => {
    // Slot đã được nhả NGAY tại cổng OUT tầng (khi left_floor_at được ghi). Chỉ nhả ở đây
    // cho luồng checkout THẲNG không qua OUT tầng (vd staff thu tiền mặt) — slot còn 'occupied'.
    // Nếu đã qua OUT tầng thì bỏ qua, tránh nhả nhầm slot có thể đã được xe khác chiếm.
    if (!session.left_floor_at) {
      await releaseSlot(session.slot_id, transaction);
    }
    await session.update(
      {
        time_out: timeOut,
        status: 'completed',
        gate_stage: 'exited', // ra cổng tòa + checkout xong -> trạng thái cuối (hết kẹt 'left_floor')
        calculated_fee: fee,
        check_out_by: staffUserId ?? session.check_out_by,
        qr_token: buildRevokedQrToken('session', session.session_id),
      },
      { transaction }
    );
    await payment.update(
      {
        status: 'success',
        paid_at: timeOut,
      },
      { transaction }
    );
    if (session.reservation_id) {
      // OR-16: giữ nguyên qr_token của đặt chỗ (user còn xem lại lịch sử); status
      // 'completed' đã đủ để cổng từ chối — xem assertReservationQrUsable.
      await markReservationCompleted(session.reservation_id, transaction);
    }
  });

  return {
    barrierOpened: true,
    session: await getSession(session.session_id),
    payment: await getPayment(payment.payment_id),
  };
};

/**
 * Cổng RA (exit gate): bắt buộc đúng tầng xe đang đỗ + đúng loại xe.
 * Sai tầng → ghi incident "wrong_floor" và KHÔNG mở barrier (DV-13, áp cho cả lối ra).
 * Ghi lại exit_gate_id để truy vết.
 */
const assertAndRecordExitGate = async (staffUserId, session, gateId) => {
  const sessionFloorId = session.slot?.zone?.floor_id ?? session.slot?.zone?.floor?.floor_id ?? null;

  let gate;
  if (gateId) {
    gate = await Gate.findByPk(Number(gateId), { include: [{ association: 'floor' }] });
    if (!gate || !gate.is_active) {
      throw new AppError('Cổng ra không tồn tại hoặc đang bảo trì', 404, 'NOT_FOUND');
    }
  } else {
    // Không gửi gateId: tự suy cổng ra của đúng tầng xe đang đỗ.
    gate = await resolveFloorGate({
      floorId: sessionFloorId,
      direction: 'out',
      vehicleTypeId: session.vehicle_type_id,
    });
  }
  if (gate.direction !== 'out') {
    throw new AppError('Check-out phải dùng cổng RA (OUT)', 400, 'VALIDATION_ERROR');
  }
  assertGateVehicleType(gate, session.vehicle_type_id);
  // Cổng cấp tòa nhà (floor_id = NULL) là điểm ra chung — bỏ qua kiểm tra trùng tầng.
  if (sessionFloorId && gate.floor_id != null && gate.floor_id !== sessionFloorId) {
    await recordIncident({
      type: 'wrong_floor',
      description: `Sai tầng tại cổng ra: cổng ở tầng ${gate.floor_id}, xe đang đỗ tầng ${sessionFloorId}`,
      sessionId: session.session_id,
      slotId: session.slot_id,
      userId: session.user_id,
      reportedBy: staffUserId,
    });
    throw new AppError(
      'Sai tầng — cổng ra không thuộc tầng xe đang đỗ. Barrier không mở (DV-13).',
      403,
      'WRONG_FLOOR',
    );
  }

  await ParkingSession.update(
    { exit_gate_id: gate.gate_id },
    { where: { session_id: session.session_id } },
  );
};

const buildCheckoutPayload = async (staffUserId, lookup) => {
  const preview = await previewCheckoutFee(lookup);
  const sessionId = preview.session.session_id;

  // Xác thực cổng ra trước khi tạo thanh toán / mở barrier
  await assertAndRecordExitGate(staffUserId, preview.session, lookup.gateId);

  const lostTicket = Boolean(lookup.lostTicket);
  const lostTicketFee = lostTicket
    ? Number(lookup.lostTicketFee ?? getLostTicketFee())
    : 0;

  if (lostTicket && lostTicketFee < 0) {
    throw new AppError('lostTicketFee must be >= 0', 400, 'VALIDATION_ERROR');
  }

  // Đơn 'pending' cũ cho phiên này: localhost không có webhook nên đơn PayOS đã bị khách
  // HỦY vẫn nằm 'pending'. Nếu tái dùng checkoutUrl cũ -> PayOS báo "đơn không tồn tại/đã
  // xử lý" và khách không trả được. -> Đánh dấu đơn cũ 'failed' rồi tạo link MỚI ở dưới.
  const existingPending = await Payment.findOne({
    where: { session_id: sessionId, status: 'pending' },
  });
  if (existingPending) {
    await existingPending.update({ status: 'failed' });
  }

  // preview.fee đã gồm phụ thu lố giờ (nếu bị enforce). Chỉ cộng thêm phụ thu MẤT VÉ ở đây.
  let fee = Number(preview.fee);
  if (lostTicket) {
    fee += lostTicketFee;
    await createIncident(staffUserId, {
      type: 'lost_ticket',
      description: `Lost ticket at checkout — surcharge ${lostTicketFee} VND`,
      sessionId,
      userId: preview.session.user_id,
    });
  }
  // LỐ GIỜ: đã thu phụ thu → tự ghi sự cố (bay lên admin), chống trùng với báo tay.
  if (preview.overstayCharge) {
    await reportOverstayCharge(staffUserId, {
      sessionId,
      userId: preview.session.user_id,
      hours: preview.overstayHours,
      fee: preview.overstayFee,
    });
  }

  if (fee <= 0) {
    const orderCode = generateOrderCode();
    const payment = await Payment.create({
      session_id: sessionId,
      order_code: orderCode,
      amount: 0,
      status: 'pending',
      method: 'free',
    });
    const result = await completeSessionAfterPayment(payment, staffUserId);
    return {
      ...result,
      fee: 0,
      checkoutUrl: null,
      pricingRule: preview.pricingRule,
      freeCheckout: true,
      passCovered: preview.passCovered || false,
      payment: result.payment,
      lostTicketFee: lostTicket ? lostTicketFee : 0,
    };
  }

  const orderCode = generateOrderCode();
  const description = `PBMS ${preview.session.plate_number}`;

  const payosResult = await createPayOSPaymentLink({
    orderCode,
    amount: fee,
    description,
    // Cho phép caller chỉ định nơi PayOS redirect về (vd kiosk công khai → /kiosk/gate).
    // Bỏ trống -> client tự fallback về /staff (luồng booth nhân viên đã đăng nhập).
    returnUrl: lookup.returnUrl,
    cancelUrl: lookup.cancelUrl,
  });

  const payment = await Payment.create({
    session_id: sessionId,
    order_code: orderCode,
    amount: fee,
    status: 'pending',
    method: 'payos',
    gateway_transaction_id: payosResult.paymentLinkId
      ? String(payosResult.paymentLinkId)
      : null,
    gateway_response: JSON.stringify(payosResult),
  });

  return {
    payment,
    fee,
    session: preview.session,
    checkoutUrl: payosResult.checkoutUrl,
    pricingRule: preview.pricingRule,
    barrierOpened: false,
    lostTicketFee: lostTicket ? lostTicketFee : 0,
  };
};

export const initiateSessionCheckout = async (staffUserId, lookup) =>
  buildCheckoutPayload(staffUserId, lookup);

/**
 * Tất toán tiền mặt tại booth: staff thu đủ tiền → mở barie ngay (không qua PayOS).
 * Ghi Payment method 'cash' rồi completeSessionAfterPayment (giải phóng slot + đóng phiên).
 * Nếu phiên đã có payment pending (vd khách lỡ bấm PayOS rồi đổi sang tiền mặt) thì
 * chuyển luôn payment đó sang 'cash' thay vì tạo bản ghi mới.
 */
export const settleCashCheckout = async (staffUserId, lookup) => {
  const preview = await previewCheckoutFee(lookup);
  const sessionId = preview.session.session_id;

  // Chốt cổng ra (auto-resolve nếu thiếu gateId) + ghi exit_gate_id, kiểm tra đúng tầng.
  await assertAndRecordExitGate(staffUserId, preview.session, lookup.gateId);

  // preview.fee đã gồm phụ thu mất vé (nếu lookup.lostTicket = true) và phụ thu lố giờ (nếu bị enforce).
  const fee = Number(preview.fee);
  if (lookup.lostTicket) {
    const lostTicketFee = Number(lookup.lostTicketFee ?? getLostTicketFee());
    await createIncident(staffUserId, {
      type: 'lost_ticket',
      description: `Lost ticket at cash checkout — surcharge ${lostTicketFee} VND`,
      sessionId,
      userId: preview.session.user_id,
    });
  }
  // LỐ GIỜ: đã thu phụ thu → tự ghi sự cố (bay lên admin), chống trùng với báo tay.
  if (preview.overstayCharge) {
    await reportOverstayCharge(staffUserId, {
      sessionId,
      userId: preview.session.user_id,
      hours: preview.overstayHours,
      fee: preview.overstayFee,
    });
  }

  let payment = await Payment.findOne({
    where: { session_id: sessionId, status: 'pending' },
  });
  if (payment) {
    await payment.update({ method: 'cash', amount: fee });
  } else {
    payment = await Payment.create({
      session_id: sessionId,
      order_code: generateOrderCode(),
      amount: fee,
      status: 'pending',
      method: 'cash',
    });
  }

  const result = await completeSessionAfterPayment(payment, staffUserId);
  return {
    ...result,
    fee,
    method: 'cash',
    pricingRule: preview.pricingRule,
    passCovered: preview.passCovered || false,
  };
};

export const markPaymentFailed = async (payment, payload) => {
  await payment.update({
    status: 'failed',
    gateway_response: JSON.stringify(payload),
  });
  return payment;
};

export const handlePaymentWebhook = async (body) => {
  const verified = await verifyPayOSWebhook(body);
  const orderCode = verified?.data?.orderCode ?? verified?.orderCode;
  const successCode = verified?.code === '00' || verified?.success === true;

  if (!orderCode) {
    throw new AppError('Invalid webhook payload', 400, 'VALIDATION_ERROR');
  }

  // PayOS gọi ping xác minh khi đăng ký webhook (orderCode test, chưa có payment).
  // Chữ ký đã verify ở trên → chỉ cần trả 200 để PayOS chấp nhận URL.
  let payment;
  try {
    payment = await getPaymentByOrderCode(orderCode);
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return { acknowledged: true, orderCode };
    }
    throw err;
  }

  if (payment.status === 'success') {
    if (payment.reservation_id) {
      const reservation = await import('./reservation.service.js').then((m) =>
        m.getReservation(payment.reservation_id)
      );
      return { payment, reservation, confirmed: true, alreadyProcessed: true };
    }
    if (payment.pass_id) {
      const pass = await import('./monthlyPass.service.js').then((m) =>
        m.getPass(payment.pass_id)
      );
      return { payment, pass, activated: true, alreadyProcessed: true };
    }
    return { payment, barrierOpened: true, alreadyProcessed: true };
  }

  const webhookStatus = verified?.data?.code ?? verified?.data?.status ?? verified?.status;

  if (successCode || webhookStatus === 'PAID' || webhookStatus === '00') {
    await payment.update({
      gateway_response: JSON.stringify(verified),
      gateway_transaction_id:
        payment.gateway_transaction_id ||
        String(verified?.data?.paymentLinkId || verified?.data?.id || ''),
    });

    if (payment.reservation_id) {
      return confirmReservationAfterPayment(payment);
    }
    if (payment.pass_id) {
      const { activatePassAfterPayment } = await import('./monthlyPass.service.js');
      return activatePassAfterPayment(payment);
    }
    return completeSessionAfterPayment(payment);
  }

  await markPaymentFailed(payment, verified);
  if (payment.reservation_id) {
    await cancelReservationOnPaymentFail(payment.reservation_id, verified);
  }
  if (payment.pass_id) {
    const { cancelPassOnPaymentFail } = await import('./monthlyPass.service.js');
    await cancelPassOnPaymentFail(payment.pass_id);
  }
  return { payment, barrierOpened: false, failed: true };
};

const STAFF_ROLES = ['Staff', 'Manager', 'Admin'];

/**
 * Khi PayOS redirect về (return URL), client gửi orderCode lên đây.
 * Server hỏi PayOS trạng thái thật (không tin query param của client), nếu PAID thì
 * xác nhận đặt chỗ / kích hoạt vé tháng / hoàn tất phiên (idempotent) và trả QR.
 *
 * requester.kiosk = true: gọi từ màn kiosk cổng (public, X-Kiosk-Key). Kiosk ở cổng RA
 * được phép chốt phiên đã trả online — trạng thái PAID vẫn được verify thật với PayOS ở
 * dưới, hoàn tất là idempotent → không có rủi ro "trả hộ" như user thường.
 */
export const verifyPaymentReturn = async (orderCode, requester = {}) => {
  const payment = await getPaymentByOrderCode(orderCode);

  const trusted = STAFF_ROLES.includes(requester.roleName) || requester.kiosk === true;
  if (!trusted) {
    const ownerId = payment.reservation?.user_id ?? payment.monthlyPass?.user_id ?? null;
    const isPureSessionCheckout =
      payment.session_id && !payment.reservation_id && !payment.pass_id;
    if (isPureSessionCheckout || (ownerId && ownerId !== requester.userId)) {
      throw new AppError('Not your payment', 403, 'FORBIDDEN');
    }
  }

  if (payment.status !== 'success') {
    const info = await getPayOSPaymentInfo(orderCode);
    if (info?.status !== 'PAID') {
      return { paid: false, status: info?.status || 'PENDING' };
    }
  }

  if (payment.reservation_id) {
    const result = await confirmReservationAfterPayment(payment);
    return {
      paid: true,
      type: 'reservation',
      reservation: result.reservation,
      payment: result.payment,
      refunded: Boolean(result.refunded),
    };
  }
  if (payment.pass_id) {
    const { activatePassAfterPayment } = await import('./monthlyPass.service.js');
    const result = await activatePassAfterPayment(payment);
    return { paid: true, type: 'monthly_pass', pass: result.pass, payment: result.payment };
  }
  const result = await completeSessionAfterPayment(payment);
  return { paid: true, type: 'session', session: result.session, payment: result.payment };
};
