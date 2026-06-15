import { Router } from 'express';
import * as auditController from '../controllers/audit.controller.js';
import { auth } from '../middleware/auth.js';
import { rbac, ROLES } from '../middleware/rbac.js';

const adminOnly = [auth, rbac(ROLES.ADMIN)];

const router = Router();

router.get('/', ...adminOnly, auditController.list);

export default router;
