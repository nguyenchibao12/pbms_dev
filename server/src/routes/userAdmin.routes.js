import { Router } from 'express';
import * as userAdminController from '../controllers/userAdmin.controller.js';
import { validate } from '../middleware/validate.js';
import { auth } from '../middleware/auth.js';
import { rbac, ROLES } from '../middleware/rbac.js';
import {
  createUserValidator,
  updateUserValidator,
  userIdParam,
} from '../validators/userAdmin.validator.js';

const adminOnly = [auth, rbac(ROLES.ADMIN)];

const router = Router();

router.get('/roles', ...adminOnly, userAdminController.listRoles);
router.get('/', ...adminOnly, userAdminController.listUsers);
router.post('/', ...adminOnly, createUserValidator, validate, userAdminController.createUser);
router.patch(
  '/:id',
  ...adminOnly,
  updateUserValidator,
  validate,
  userAdminController.updateUser,
);

export default router;
