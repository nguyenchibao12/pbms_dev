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

router.get('/roles',
  /* #swagger.tags = ['Admin']
     #swagger.summary = 'Danh sách role để gán (Admin)' */
  ...adminOnly, userAdminController.listRoles);

router.get('/',
  /* #swagger.tags = ['Admin']
     #swagger.summary = 'Danh sách tài khoản (Admin)' */
  ...adminOnly, userAdminController.listUsers);

router.post('/',
  /* #swagger.tags = ['Admin']
     #swagger.summary = 'Tạo tài khoản (Admin)'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { username: 'manager01', password: 'matkhau123', fullName: 'Trần Thị B', email: 'b@gmail.com', phone: '0900000000', roleId: 2 } } } } */
  ...adminOnly, createUserValidator, validate, userAdminController.createUser);

router.patch(
  '/:id',
  /* #swagger.tags = ['Admin']
     #swagger.summary = 'Cập nhật tài khoản — đổi role/khóa/mật khẩu (Admin)'
     #swagger.requestBody = { required: true, content: { 'application/json': { example: { fullName: 'Trần Thị B', email: 'b@gmail.com', phone: '0900000000', roleId: 3, isActive: true, password: 'matkhaumoi' } } } } */
  ...adminOnly,
  updateUserValidator,
  validate,
  userAdminController.updateUser,
);

export default router;
