import { Router } from 'express';
import * as publicController from '../controllers/public.controller.js';

const router = Router();

router.get('/pricing',
  /* #swagger.tags = ['Public']
     #swagger.summary = 'Bảng giá công khai'
     #swagger.security = [] */
  publicController.pricing);

router.get('/availability',
  /* #swagger.tags = ['Public']
     #swagger.summary = 'Số chỗ trống công khai'
     #swagger.security = [] */
  publicController.availability);

router.get('/info',
  /* #swagger.tags = ['Public']
     #swagger.summary = 'Thông tin tòa nhà công khai'
     #swagger.security = [] */
  publicController.info);

export default router;
