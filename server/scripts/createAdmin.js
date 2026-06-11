/**
 * Create (or update) an Admin account for first-time production bootstrap.
 *
 * Usage:
 *   node scripts/createAdmin.js <username> <password> [fullName] [email]
 * or via env:
 *   ADMIN_USERNAME=... ADMIN_PASSWORD=... node scripts/createAdmin.js
 *
 * Re-running with an existing username resets that user's password and ensures Admin role.
 */
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import sequelize, { syncSchema } from '../src/config/db.js';
import { Role, UserAccount } from '../src/models/index.js';
import { ensureRoles } from '../src/utils/ensureRoles.js';
import { ROLES } from '../src/middleware/rbac.js';

dotenv.config();

const [, , argUser, argPass, argName, argEmail] = process.argv;

const username = argUser || process.env.ADMIN_USERNAME;
const password = argPass || process.env.ADMIN_PASSWORD;
const fullName = argName || process.env.ADMIN_FULLNAME || 'System Administrator';
const email = argEmail || process.env.ADMIN_EMAIL || null;

const run = async () => {
  if (!username || !password) {
    console.error(
      'Missing credentials.\n' +
        'Usage: node scripts/createAdmin.js <username> <password> [fullName] [email]\n' +
        'Or set ADMIN_USERNAME and ADMIN_PASSWORD in the environment.',
    );
    process.exit(1);
  }
  if (String(password).length < 6) {
    console.error('Password must be at least 6 characters.');
    process.exit(1);
  }

  try {
    await sequelize.authenticate();
    await syncSchema();
    await ensureRoles();

    const adminRole = await Role.findOne({ where: { role_name: ROLES.ADMIN } });
    const passwordHash = await bcrypt.hash(password, 10);

    const existing = await UserAccount.unscoped().findOne({ where: { username } });
    if (existing) {
      await existing.update({
        password_hash: passwordHash,
        role_id: adminRole.role_id,
        is_active: true,
      });
      console.log(`Admin "${username}" updated (password reset, Admin role ensured).`);
    } else {
      await UserAccount.create({
        username,
        password_hash: passwordHash,
        full_name: fullName,
        email,
        role_id: adminRole.role_id,
        is_active: true,
      });
      console.log(`Admin "${username}" created.`);
    }
    process.exit(0);
  } catch (err) {
    console.error('Failed to create admin:', err.message || err);
    process.exit(1);
  }
};

run();
