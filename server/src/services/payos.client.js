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

export const generateOrderCode = () => {
  const timePart = Date.now() % 1_000_000_000;
  const randPart = Math.floor(Math.random() * 1000);
  return timePart * 1000 + randPart;
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

export const verifyPayOSWebhook = async (body) => {
  const payos = getPayOSClient();
  return payos.webhooks.verify(body);
};
