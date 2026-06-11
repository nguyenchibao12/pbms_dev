import { Role } from '../models/index.js';
import { ROLES } from '../middleware/rbac.js';

/**
 * Reference data: the 4 roles must always exist for RBAC and registration to work.
 * Runs at startup (idempotent) — this is system bootstrap, not demo seeding.
 */
export const ensureRoles = async () => {
  for (const roleName of [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF, ROLES.USER]) {
    await Role.findOrCreate({
      where: { role_name: roleName },
      defaults: { role_name: roleName },
    });
  }
};
