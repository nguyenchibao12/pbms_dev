import { PayOS } from '@payos/node';
import { AppError } from '../utils/helpers.js';

let payosClient = null;

export const isPayOSConfigured = () =>
  Boolean(
    process.env.PAYOS_CLIENT_ID &&
      process.env.PAYOS_API_KEY &&
      process.env.PAYOS_CHECKSUM_KEY
  );

export const getPayOSClient = () => {
  if (!isPayOSConfigured()) {
    throw new AppError(
      'PayOS is not configured. Set PAYOS_CLIENT_ID, PAYOS_API_KEY and PAYOS_CHECKSUM_KEY.',
      500,
      'PAYMENT_NOT_CONFIGURED',
    );
  }
  if (!payosClient) {
    payosClient = new PayOS({
      clientId: process.env.PAYOS_CLIENT_ID,
      apiKey: process.env.PAYOS_API_KEY,
      checksumKey: process.env.PAYOS_CHECKSUM_KEY,
    });
  }
  return payosClient;
};

// orderCode PayOS: số nguyên dương DUY NHẤT (cột payment.order_code BIGINT unique).
// mốc-thời-gian(ms) × 1000 + rand(0..999), kèm mốc đơn điệu bảo đảm KHÔNG trùng trong cùng tiến
// trình dù nhiều đơn trong 1 ms. Trần an toàn: Date.now()×1000 ≈ 1.7e15 < 9_007_199_254_740_991
// (Number.MAX_SAFE_INTEGER = trần orderCode PayOS). Bản cũ Date.now() % 1e9 LẶP LẠI mỗi ~11.5
// ngày (dễ đụng unique) và rand đơn thuần vẫn trùng 1/1000 khi trùng ms.
let lastOrderCode = 0;
export const generateOrderCode = () => {
  const base = Date.now() * 1000 + Math.floor(Math.random() * 1000);
  const code = base > lastOrderCode ? base : lastOrderCode + 1;
  lastOrderCode = code;
  return code;
};

export const createPayOSPaymentLink = async ({ orderCode, amount, description, returnUrl, cancelUrl }) => {
  const finalReturnUrl =
    returnUrl || process.env.PAYOS_RETURN_URL || `${process.env.CLIENT_URL}/staff?payment=return`;
  const finalCancelUrl =
    cancelUrl || process.env.PAYOS_CANCEL_URL || `${process.env.CLIENT_URL}/staff?payment=cancel`;

  const payos = getPayOSClient();
  const result = await payos.paymentRequests.create({
    orderCode,
    amount: Math.round(amount),
    description: description.slice(0, 25),
    returnUrl: finalReturnUrl,
    cancelUrl: finalCancelUrl,
  });

  return result;
};

/** Lấy trạng thái thật của payment link từ PayOS (status: PAID|PENDING|CANCELLED|...) */
export const getPayOSPaymentInfo = async (orderCode) => {
  const payos = getPayOSClient();
  return payos.paymentRequests.get(Number(orderCode));
};

/**
 * Hủy hẳn đơn cũ Ở PHÍA PAYOS (không chỉ đánh dấu trong DB mình).
 * Bắt buộc trước khi phát link mới cho cùng một đơn: hai link cùng sống = khách có thể trả
 * tiền HAI LẦN cho một chỗ đỗ. Đơn đã CANCELLED/PAID sẵn thì PayOS ném lỗi — người gọi tự xử.
 */
export const cancelPayOSPaymentLink = async (orderCode, reason = 'Khách tạo lại liên kết thanh toán') => {
  const payos = getPayOSClient();
  return payos.paymentRequests.cancel(Number(orderCode), reason);
};

export const verifyPayOSWebhook = async (body) => {
  const payos = getPayOSClient();
  return payos.webhooks.verify(body);
};
