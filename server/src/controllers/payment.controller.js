import * as paymentService from '../services/payment.service.js';
import { asyncHandler, successResponse, AppError } from '../utils/helpers.js';

export const get = asyncHandler(async (req, res) => {
  const payment = await paymentService.getPayment(req.params.id);
  successResponse(res, payment);
});

export const webhook = asyncHandler(async (req, res) => {
  const result = await paymentService.handlePaymentWebhook(req.body);
  successResponse(res, result, 'Webhook processed');
});

export const verifyReturn = asyncHandler(async (req, res) => {
  const orderCode = req.query.orderCode;
  if (!orderCode) {
    throw new AppError('orderCode is required', 400, 'VALIDATION_ERROR');
  }
  const result = await paymentService.verifyPaymentReturn(orderCode, {
    userId: req.user.user_id,
    roleName: req.user.role?.role_name,
  });
  successResponse(res, result, result.paid ? 'Payment verified' : 'Payment not completed');
});
