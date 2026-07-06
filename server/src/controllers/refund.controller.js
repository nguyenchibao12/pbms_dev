import * as refundService from '../services/refund.service.js';
import { asyncHandler, successResponse } from '../utils/helpers.js';

export const list = asyncHandler(async (req, res) => {
  const result = await refundService.listRefunds({
    status: req.query.status,
    page: req.query.page,
    limit: req.query.limit,
  });
  successResponse(res, result);
});

export const remind = asyncHandler(async (req, res) => {
  const result = await refundService.remindBankInfo(req.params.id);
  successResponse(res, result, `Đã gửi email nhắc cập nhật tài khoản ngân hàng tới ${result.to}`);
});

export const complete = asyncHandler(async (req, res) => {
  const refund = await refundService.completeRefund(req.user.user_id, req.params.id, {
    note: req.body?.note,
  });
  successResponse(res, refund, 'Đã đánh dấu hoàn tiền thành công');
});
