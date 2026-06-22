import { Router } from 'express';
import * as sessionController from '../controllers/session.controller.js';
import { validate } from '../middleware/validate.js';
import { staffOnly, staffOrManager, authenticated, userOnly } from '../middleware/access.js';
import {
  checkinValidator,
  checkoutValidator,
  previewFeeValidator,
  sessionIdParam,
  correctPlateValidator,
  staffQrLookupValidator,
} from '../validators/session.validator.js';

const router = Router();

router.get('/active',
  /* #swagger.tags = ['Sessions']
     #swagger.summary = 'Xe đang trong bãi (Staff)' */
  ...staffOnly, sessionController.listActive);

router.get('/mine/active',
  /* #swagger.tags = ['Sessions']
     #swagger.summary = 'Phiên đang mở của tôi (User)' */
  ...userOnly, sessionController.listMineActive);

router.get(
  '/staff/lookup',
  /* #swagger.tags = ['Sessions']
     #swagger.summary = 'Tra cứu phiên bằng QR (Staff/Manager)'
     #swagger.parameters['qrToken'] = { in: 'query', required: true, description: 'Mã QR trên vé (≥16 ký tự)', schema: { type: 'string' } } */
  ...staffOrManager,
  staffQrLookupValidator,
  validate,
  sessionController.staffLookupByQr,
);

router.get('/:id',
  /* #swagger.tags = ['Sessions']
     #swagger.summary = 'Chi tiết phiên' */
  ...authenticated, sessionIdParam, validate, sessionController.get);

router.post('/checkin',
  /* #swagger.tags = ['Sessions']
     #swagger.summary = 'Check-in xe vào (Staff)'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { plateNumber: '51F-12345', vehicleTypeId: 1, floorId: 1, gateId: 1, zoneId: 1 } } } } */
  ...staffOnly, checkinValidator, validate, sessionController.checkin);

router.post('/checkout',
  /* #swagger.tags = ['Sessions']
     #swagger.summary = 'Check-out xe ra + tính phí (Staff)'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { plateNumber: '51F-12345', gateId: 2, lostTicket: false } } } } */
  ...staffOnly, checkoutValidator, validate, sessionController.checkout);

router.post('/cash-checkout',
  /* #swagger.tags = ['Sessions']
     #swagger.summary = 'Tất toán tiền mặt tại booth + mở barie (Staff)'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { qrToken: 'xxxxxxxxxxxxxxxx', gateId: 2, lostTicket: false } } } } */
  ...staffOnly, checkoutValidator, validate, sessionController.cashCheckout);

router.post('/preview-fee',
  /* #swagger.tags = ['Sessions']
     #swagger.summary = 'Xem trước phí (Staff)'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { plateNumber: '51F-12345', lostTicket: false } } } } */
  ...staffOnly, previewFeeValidator, validate, sessionController.previewFee);

router.patch('/:id/plate',
  /* #swagger.tags = ['Sessions']
     #swagger.summary = 'Sửa biển số phiên (Staff)'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { plateNumber: '51F-67890' } } } } */
  ...staffOnly, correctPlateValidator, validate, sessionController.correctPlate);

export default router;
