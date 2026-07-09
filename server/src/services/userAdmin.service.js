import bcrypt from 'bcryptjs';
import { UserAccount, Role } from '../models/index.js';
import { AppError } from '../utils/helpers.js';
import { ROLES } from '../middleware/rbac.js';
import { logAdminAction } from '../utils/auditLog.js';

const userIncludes = [{ association: 'role', attributes: ['role_id', 'role_name'] }];

const formatUser = (user) => ({
  user_id: user.user_id,
  username: user.username,
  full_name: user.full_name,
  email: user.email,
  phone: user.phone,
  is_active: user.is_active,
  role_id: user.role_id,
  role: user.role
    ? { role_id: user.role.role_id, role_name: user.role.role_name }
    : null,
  created_at: user.created_at,
});

export const listRoles = async () =>
  Role.findAll({ order: [['role_name', 'ASC']] });

export const listUsers = async () => {
  const users = await UserAccount.findAll({
    include: userIncludes,
    order: [['username', 'ASC']],
  });
  return users.map(formatUser);
};

const resolveRole = async (roleId) => {
  const role = await Role.findByPk(roleId);
  if (!role) throw new AppError('Vai trò không tồn tại', 404, 'NOT_FOUND');
  return role;
};

// Chặn trùng username/email/SĐT (unique ở DB) → trả 409 rõ ràng thay vì để Sequelize ném 500.
// excludeId: bỏ qua chính user đang sửa.
const assertUniqueFields = async ({ username, email, phone }, excludeId = null) => {
  const notSelf = (row) => row && row.user_id !== excludeId;
  if (username) {
    const dup = await UserAccount.unscoped().findOne({ where: { username } });
    if (notSelf(dup)) throw new AppError('Tên đăng nhập đã tồn tại', 409, 'CONFLICT');
  }
  if (email) {
    const dup = await UserAccount.unscoped().findOne({ where: { email } });
    if (notSelf(dup)) throw new AppError('Email đã được dùng cho tài khoản khác', 409, 'CONFLICT');
  }
  if (phone) {
    const dup = await UserAccount.unscoped().findOne({ where: { phone } });
    if (notSelf(dup)) throw new AppError('Số điện thoại đã được dùng cho tài khoản khác', 409, 'CONFLICT');
  }
};

export const createUser = async (adminId, data) => {
  await assertUniqueFields({
    username: data.username,
    email: data.email || null,
    phone: data.phone || null,
  });

  const role = await resolveRole(data.roleId);
  const passwordHash = await bcrypt.hash(data.password, 10);

  const user = await UserAccount.create({
    username: data.username,
    password_hash: passwordHash,
    full_name: data.fullName,
    email: data.email || null,
    phone: data.phone || null,
    role_id: role.role_id,
    is_active: true,
  });

  await logAdminAction(adminId, 'user.create', {
    targetUserId: user.user_id,
    username: user.username,
    role: role.role_name,
  });

  return formatUser(await UserAccount.findByPk(user.user_id, { include: userIncludes }));
};

export const updateUser = async (adminId, userId, data) => {
  const user = await UserAccount.findByPk(userId, { include: userIncludes });
  if (!user) throw new AppError('Không tìm thấy người dùng', 404, 'NOT_FOUND');

  if (userId === adminId) {
    if (data.isActive === false) {
      throw new AppError('Không thể tự khóa tài khoản của mình', 409, 'CONFLICT');
    }
    if (data.roleId && data.roleId !== user.role_id) {
      throw new AppError('Không thể tự đổi vai trò của mình', 409, 'CONFLICT');
    }
  }

  // Chặn trùng email/SĐT với tài khoản KHÁC (nếu có thay đổi).
  await assertUniqueFields(
    {
      email: data.email !== undefined ? data.email || null : null,
      phone: data.phone !== undefined ? data.phone || null : null,
    },
    userId,
  );

  const patch = {};
  if (data.fullName != null) patch.full_name = data.fullName;
  if (data.email !== undefined) patch.email = data.email || null;
  if (data.phone !== undefined) patch.phone = data.phone || null;
  if (data.isActive != null) patch.is_active = Boolean(data.isActive);

  if (data.roleId != null) {
    const role = await resolveRole(data.roleId);
    patch.role_id = role.role_id;
  }

  if (data.password) {
    patch.password_hash = await bcrypt.hash(data.password, 10);
  }

  await user.update(patch);

  const changed = Object.keys(patch);
  await logAdminAction(adminId, 'user.update', {
    targetUserId: userId,
    targetUsername: user.username,
    fields: changed.filter((k) => k !== 'password_hash'),
    passwordChanged: changed.includes('password_hash'),
    ...(patch.is_active !== undefined ? { isActive: patch.is_active } : {}),
  });

  return formatUser(await UserAccount.findByPk(userId, { include: userIncludes }));
};

export const getAssignableRoles = () =>
  Object.values(ROLES).map((name) => ({ role_name: name }));
