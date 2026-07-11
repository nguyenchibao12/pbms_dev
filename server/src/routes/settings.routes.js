import { Router } from 'express';
import * as settingsController from '../controllers/settings.controller.js';
import { validate } from '../middleware/validate.js';
import { managerOrAdmin } from '../middleware/access.js';
import { updateSystemValidator } from '../validators/settings.validator.js';

const router = Router();

router.get('/system',
  /* #swagger.tags = ['Settings']
     #swagger.summary = 'Đọc cấu hình hệ thống (Manager/Admin)' */
  ...managerOrAdmin, settingsController.getSystem);

router.patch('/system',
  /* #swagger.tags = ['Settings']
     #swagger.summary = 'Cập nhật cấu hình hệ thống (Manager/Admin)'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { booking_fee: 20000, monthly_pass_price: 500000, lost_ticket_fee: 50000, overstay_fee: 30000, max_parking_hours: 24, pass_refund_trial_days: 3, pass_refund_trial_percent: 70, pass_refund_half_term_percent: 50, pass_refund_bank_info_ttl_days: 7 } } } } */
  ...managerOrAdmin, updateSystemValidator, validate, settingsController.updateSystem);

export default router;
