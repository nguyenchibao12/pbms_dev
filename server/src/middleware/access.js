import { auth } from './auth.js';
import { rbac, ROLES } from './rbac.js';

export const managerWrite = [auth, rbac(ROLES.MANAGER)];
export const managerOnly = [auth, rbac(ROLES.MANAGER)];
export const staffOnly = [auth, rbac(ROLES.STAFF)];
export const userOnly = [auth, rbac(ROLES.USER)];
export const authenticated = [auth];
export const adminOnly = [auth, rbac(ROLES.ADMIN)];
export const staffOrManager = [auth, rbac(ROLES.STAFF, ROLES.MANAGER)];
export const staffOrManagerOrAdmin = [auth, rbac(ROLES.STAFF, ROLES.MANAGER, ROLES.ADMIN)];
export const managerOrAdmin = [auth, rbac(ROLES.MANAGER, ROLES.ADMIN)];
