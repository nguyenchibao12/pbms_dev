import { Router } from 'express';
import * as monthlyPassController from '../controllers/monthlyPass.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticated, userOnly } from '../middleware/access.js';
import { purchasePassValidator, passIdParam } from '../validators/monthlyPass.validator.js';

const router = Router();

router.post('/',
  /* #swagger.tags = ['Monthly Passes']
     #swagger.summary = 'Mua vé tháng (User) — tạo đơn + link thanh toán PayOS'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { plateNumber: '51F-67890', vehicleTypeId: 1, floorId: 1, startDate: '2026-07-01' } } } }
     #swagger.description = 'Vé cố định 1 tháng; ngày kết thúc + khung giờ (theo giờ mở cửa tòa) do server tự tính.' */
  ...userOnly, purchasePassValidator, validate, monthlyPassController.purchase);

router.get('/mine',
  /* #swagger.tags = ['Monthly Passes']
     #swagger.summary = 'Vé tháng của tôi (User)' */
  ...userOnly, monthlyPassController.listMine);

router.get('/capacity',
  /* #swagger.tags = ['Monthly Passes']
     #swagger.summary = 'Sức chứa vé tháng còn lại theo tầng + loại xe'
     #swagger.parameters['floorId'] = { in: 'query', required: true, schema: { type: 'integer' } }
     #swagger.parameters['vehicleTypeId'] = { in: 'query', required: true, schema: { type: 'integer' } } */
  ...authenticated, monthlyPassController.getCapacity);

router.post('/:id/cancel',
  /* #swagger.tags = ['Monthly Passes']
     #swagger.summary = 'Hủy vé tháng (User, chủ vé) — tính % hoàn theo chính sách'
     #swagger.description = 'Trước ngày hiệu lực hoàn 100%; 3 ngày đầu 70%; tới hết nửa thời hạn 50%; quá nửa không hoàn. Có tiền hoàn → tạo yêu cầu hoàn tiền cho Admin xử lý (cần user cập nhật STK trong hạn).' */
  ...userOnly, passIdParam, validate, monthlyPassController.cancel);

router.post('/:id/repay',
  /* #swagger.tags = ['Monthly Passes']
     #swagger.summary = 'Lấy lại link thanh toán cho vé pending (User, chủ vé)'
     #swagger.description = 'Link PayOS cũ còn hiệu lực thì trả lại; hết hiệu lực thì đánh dấu payment cũ failed và sinh link + payment mới. Trả về { checkoutUrl, reused }.' */
  ...userOnly, passIdParam, validate, monthlyPassController.repay);

// LƯU Ý: '/:id' (route bắt-tất) phải nằm DƯỚI mọi route chữ cụ thể như '/mine', '/capacity'.
router.get('/:id',
  /* #swagger.tags = ['Monthly Passes']
     #swagger.summary = 'Chi tiết vé tháng (chủ vé hoặc Staff)' */
  ...authenticated, passIdParam, validate, monthlyPassController.get);

export default router;
