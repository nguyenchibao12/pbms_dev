import { Router } from 'express';
import * as auditController from '../controllers/audit.controller.js';
import { auth } from '../middleware/auth.js';
import { rbac, ROLES } from '../middleware/rbac.js';

const adminOnly = [auth, rbac(ROLES.ADMIN)];

const router = Router();

router.get('/',
  /* #swagger.tags = ['Admin']
     #swagger.summary = 'Nhật ký thao tác Admin — lọc & phân trang (Admin)'
     #swagger.parameters['page'] = { in: 'query', description: 'Trang (mặc định 1)', schema: { type: 'integer' } }
     #swagger.parameters['limit'] = { in: 'query', description: 'Số dòng/trang (mặc định 50, tối đa 200)', schema: { type: 'integer' } }
     #swagger.parameters['actorId'] = { in: 'query', description: 'Lọc theo user thực hiện', schema: { type: 'integer' } }
     #swagger.parameters['action'] = { in: 'query', description: 'Lọc theo hành động, vd user.create', schema: { type: 'string' } }
     #swagger.parameters['from'] = { in: 'query', description: 'Từ ngày (ISO)', schema: { type: 'string' } }
     #swagger.parameters['to'] = { in: 'query', description: 'Đến ngày (ISO)', schema: { type: 'string' } } */
  ...adminOnly, auditController.list);

export default router;
