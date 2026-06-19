import { Router } from 'express';
import * as paymentController from '../controllers/payment.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticated } from '../middleware/access.js';
import { paymentIdParam } from '../validators/payment.validator.js';

const router = Router();

router.post('/webhook',
  /* #swagger.tags = ['Payments']
     #swagger.summary = 'Webhook PayOS (PayOS gọi — không cần đăng nhập)'
     #swagger.security = []
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { code: '00', data: { orderCode: 123 } } } } } */
  paymentController.webhook);

router.get('/verify',
  /* #swagger.tags = ['Payments']
     #swagger.summary = 'Xác minh thanh toán sau khi PayOS redirect về'
     #swagger.parameters['orderCode'] = { in: 'query', required: true, description: 'Mã đơn PayOS', schema: { type: 'integer' } } */
  ...authenticated, paymentController.verifyReturn);

router.get('/:id',
  /* #swagger.tags = ['Payments']
     #swagger.summary = 'Chi tiết thanh toán' */
  ...authenticated, paymentIdParam, validate, paymentController.get);

export default router;
