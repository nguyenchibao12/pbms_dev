import { Router } from 'express';
import { param, query, body } from 'express-validator';
import * as refundController from '../controllers/refund.controller.js';
import { validate } from '../middleware/validate.js';
import { adminOnly } from '../middleware/access.js';
import { REFUND_STATUSES } from '../models/refundRequest.model.js';

const router = Router();

const refundIdParam = [param('id').isInt({ min: 1 }).withMessage('Invalid refund id')];

router.get('/',
  /* #swagger.tags = ['Refunds']
     #swagger.summary = 'Danh sách yêu cầu hoàn tiền hủy vé tháng (Admin)'
     #swagger.parameters['status'] = { in: 'query', description: 'pending | refunded | expired', schema: { type: 'string' } } */
  ...adminOnly,
  query('status').optional().isIn(REFUND_STATUSES),
  validate,
  refundController.list);

router.post('/:id/remind',
  /* #swagger.tags = ['Refunds']
     #swagger.summary = 'Gửi email nhắc user cập nhật tài khoản ngân hàng (Admin)'
     #swagger.description = 'Chỉ dùng khi user CHƯA có STK. Email kèm link tới trang profile để cập nhật.' */
  ...adminOnly, refundIdParam, validate, refundController.remind);

router.post('/:id/complete',
  /* #swagger.tags = ['Refunds']
     #swagger.summary = 'Đánh dấu đã chuyển khoản hoàn tiền (Admin)'
     #swagger.description = 'Admin chuyển khoản TAY xong mới bấm. Yêu cầu user đã có STK. Payment gốc chuyển refunded.'
     #swagger.requestBody = { content: { 'application/json': { example: { note: 'CK Vietcombank 06/07 mã GD 12345' } } } } */
  ...adminOnly,
  refundIdParam,
  body('note').optional().isLength({ max: 255 }),
  validate,
  refundController.complete);

export default router;
