import * as userAdminService from '../services/userAdmin.service.js';
import { asyncHandler, successResponse } from '../utils/helpers.js';

export const listUsers = asyncHandler(async (_req, res) => {
  const users = await userAdminService.listUsers();
  successResponse(res, users);
});

export const listRoles = asyncHandler(async (_req, res) => {
  const roles = await userAdminService.listRoles();
  successResponse(res, roles);
});

export const createUser = asyncHandler(async (req, res) => {
  const user = await userAdminService.createUser(req.user.user_id, req.body);
  successResponse(res, user, 'User created', 201);
});

export const updateUser = asyncHandler(async (req, res) => {
  const user = await userAdminService.updateUser(
    req.user.user_id,
    Number(req.params.id),
    req.body,
  );
  successResponse(res, user, 'User updated');
});
