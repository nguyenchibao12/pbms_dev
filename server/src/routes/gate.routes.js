import { Router } from 'express';
import * as gateController from '../controllers/gate.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticated, managerWrite } from '../middleware/access.js';
import { kioskAuth } from '../middleware/kiosk.js';
import { gateValidators, gateScanValidator, idParam } from '../validators/masterData.validator.js';

const router = Router();

router.post('/scan',
  /* #swagger.tags = ['Gates']
     #swagger.summary = 'Kiosk cổng — quét QR mở/đóng cổng (header X-Kiosk-Key, không cần đăng nhập)'
     #swagger.security = []
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { gateId: 1, qrToken: 'xxxxxxxxxxxxxxxx' } } } } */
  kioskAuth, gateScanValidator, validate, gateController.scan);

router.get('/exit-status',
  /* #swagger.tags = ['Gates']
     #swagger.summary = 'Kiosk poll trạng thái ra của phiên (header X-Kiosk-Key, không cần đăng nhập)'
     #swagger.security = []
     #swagger.parameters['sessionId'] = { in: 'query', required: true, schema: { type: 'integer' } } */
  kioskAuth, gateController.exitStatus);

router.get('/kiosk-list',
  /* #swagger.tags = ['Gates']
     #swagger.summary = 'Kiosk — danh sách cổng (header X-Kiosk-Key, không cần đăng nhập)'
     #swagger.security = [] */
  kioskAuth, gateController.kioskList);

router.get('/payment-status',
  /* #swagger.tags = ['Gates']
     #swagger.summary = 'Kiosk — chốt phiên sau khi trả PayOS online (header X-Kiosk-Key)'
     #swagger.security = []
     #swagger.parameters['orderCode'] = { in: 'query', required: true, description: 'Mã đơn PayOS', schema: { type: 'integer' } } */
  kioskAuth, gateController.kioskPaymentStatus);

router.get('/',
  /* #swagger.tags = ['Gates']
     #swagger.summary = 'Danh sách cổng'
     #swagger.parameters['floorId'] = { in: 'query', description: 'Lọc theo tầng', schema: { type: 'integer' } } */
  ...authenticated, gateValidators.list, validate, gateController.list);

router.get('/:id',
  /* #swagger.tags = ['Gates']
     #swagger.summary = 'Chi tiết cổng' */
  ...authenticated, idParam, validate, gateController.get);

router.post('/',
  /* #swagger.tags = ['Gates']
     #swagger.summary = 'Thêm cổng (Manager) — mã cổng tự sinh theo <TẦNG>-<IN|OUT>'
     #swagger.description = 'Mã cổng do hệ thống sinh (không gửi gateCode). Mỗi tầng/tòa chỉ 1 cổng IN + 1 OUT.'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { floorId: 1, direction: 'in', label: 'Cổng vào tầng 1' } } } } */
  ...managerWrite, gateValidators.create, validate, gateController.create);

router.put('/:id',
  /* #swagger.tags = ['Gates']
     #swagger.summary = 'Sửa cổng (Manager)'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { isActive: true } } } } */
  ...managerWrite, gateValidators.update, validate, gateController.update);

router.delete('/:id',
  /* #swagger.tags = ['Gates']
     #swagger.summary = 'Xóa cổng (Manager)' */
  ...managerWrite, idParam, validate, gateController.remove);

export default router;
