import { AppError } from '../utils/helpers.js';

export const rbac =
  (...allowedRoles) =>
  (req, _res, next) => {
    const roleName = req.user?.role?.role_name;
    if (!roleName || !allowedRoles.includes(roleName)) {
      return next(new AppError('Insufficient permissions', 403, 'FORBIDDEN'));
    }
    next();
  };

export const ROLES = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  STAFF: 'Staff',
  USER: 'User',
};
