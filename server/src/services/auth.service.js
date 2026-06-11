import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Op } from 'sequelize';
import { Role, UserAccount } from '../models/index.js';
import { signToken } from '../utils/jwt.js';
import { AppError } from '../utils/helpers.js';
import { ROLES } from '../middleware/rbac.js';
import { sendPasswordResetEmail } from '../utils/mailer.js';
import { verifyGoogleIdToken } from '../utils/google.js';

const formatUser = (user) => ({
  userId: user.user_id,
  username: user.username,
  fullName: user.full_name,
  email: user.email,
  phone: user.phone,
  isActive: user.is_active,
  authProvider: user.auth_provider,
  role: user.role
    ? { roleId: user.role.role_id, roleName: user.role.role_name }
    : null,
});

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const getUserRole = async () => {
  const userRole = await Role.findOne({ where: { role_name: ROLES.USER } });
  if (!userRole) {
    throw new AppError('Default User role not found. Restart the server to bootstrap roles.', 500, 'INTERNAL_ERROR');
  }
  return userRole;
};

const withRole = async (userId) =>
  UserAccount.findByPk(userId, {
    include: [{ association: 'role', attributes: ['role_id', 'role_name'] }],
  });

/** Sinh username duy nhất từ email (cho user đăng nhập Google). */
const deriveUsername = async (email) => {
  const raw = (email.split('@')[0] || 'user').replace(/[^a-zA-Z0-9._-]/g, '');
  const base = (raw.length >= 3 ? raw : `${raw}usr`).slice(0, 40);
  let candidate = base;
  let n = 0;
  // eslint-disable-next-line no-await-in-loop
  while (await UserAccount.unscoped().findOne({ where: { username: candidate } })) {
    n += 1;
    candidate = `${base.slice(0, 36)}_${n}`;
  }
  return candidate.slice(0, 50);
};

export const register = async ({ username, password, fullName, email, phone }) => {
  const normalizedEmail = (email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    throw new AppError('Email là bắt buộc', 400, 'VALIDATION_ERROR');
  }

  const existing = await UserAccount.unscoped().findOne({
    where: { [Op.or]: [{ username }, { email: normalizedEmail }] },
  });
  if (existing) {
    const conflictField = existing.username === username ? 'Tên đăng nhập' : 'Email';
    throw new AppError(`${conflictField} đã được sử dụng`, 409, 'CONFLICT');
  }

  const userRole = await getUserRole();
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await UserAccount.create({
    username,
    password_hash: passwordHash,
    full_name: fullName,
    email: normalizedEmail,
    phone: phone || null,
    role_id: userRole.role_id,
    is_active: true,
    auth_provider: 'local',
  });

  const token = signToken({ userId: user.user_id, roleName: ROLES.USER });
  return { user: formatUser(await withRole(user.user_id)), token };
};

export const login = async ({ username, password }) => {
  const user = await UserAccount.scope('withPassword').findOne({
    where: { username },
    include: [{ association: 'role', attributes: ['role_id', 'role_name'] }],
  });

  if (!user || !user.is_active) {
    throw new AppError('Invalid username or password', 401, 'UNAUTHORIZED');
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new AppError('Invalid username or password', 401, 'UNAUTHORIZED');
  }

  const token = signToken({ userId: user.user_id, roleName: user.role.role_name });
  return { user: formatUser(user), token };
};

export const getMe = async (userId) => {
  const user = await withRole(userId);
  if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');
  return formatUser(user);
};

/** Quên mật khẩu: sinh token, lưu hash, gửi email link reset. */
export const forgotPassword = async ({ email }) => {
  const normalizedEmail = (email || '').trim().toLowerCase();
  const user = await UserAccount.unscoped().findOne({ where: { email: normalizedEmail } });

  // Chỉ gửi mail nếu user tồn tại + là tài khoản local. Luôn trả message chung (không lộ email tồn tại hay không).
  if (user && user.auth_provider === 'local') {
    const token = crypto.randomBytes(32).toString('hex');
    const ttlMin = Number(process.env.RESET_TOKEN_TTL_MINUTES) || 60;
    await user.update({
      reset_token_hash: sha256(token),
      reset_token_expires: new Date(Date.now() + ttlMin * 60 * 1000),
    });

    const base = process.env.CLIENT_URL || 'http://localhost:5173';
    const resetUrl = `${base}/reset-password?token=${token}&email=${encodeURIComponent(normalizedEmail)}`;
    await sendPasswordResetEmail(normalizedEmail, resetUrl);
  }

  return { message: 'Nếu email tồn tại trong hệ thống, link đặt lại mật khẩu đã được gửi.' };
};

/** Đặt lại mật khẩu bằng token đã gửi qua email. */
export const resetPassword = async ({ email, token, newPassword }) => {
  const normalizedEmail = (email || '').trim().toLowerCase();
  const user = await UserAccount.unscoped().findOne({ where: { email: normalizedEmail } });

  if (
    !user ||
    !user.reset_token_hash ||
    !user.reset_token_expires ||
    new Date(user.reset_token_expires) < new Date() ||
    user.reset_token_hash !== sha256(token)
  ) {
    throw new AppError('Token đặt lại không hợp lệ hoặc đã hết hạn', 400, 'RESET_TOKEN_INVALID');
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await user.update({
    password_hash: passwordHash,
    reset_token_hash: null,
    reset_token_expires: null,
  });

  return { message: 'Đặt lại mật khẩu thành công. Hãy đăng nhập bằng mật khẩu mới.' };
};

/** Đăng nhập/đăng ký bằng Google ID token. */
export const loginWithGoogle = async ({ idToken }) => {
  const profile = await verifyGoogleIdToken(idToken);
  if (!profile.emailVerified) {
    throw new AppError('Email Google chưa được xác minh', 401, 'GOOGLE_EMAIL_UNVERIFIED');
  }
  const email = profile.email.trim().toLowerCase();

  let user = await UserAccount.unscoped().findOne({
    where: { [Op.or]: [{ google_id: profile.sub }, { email }] },
    include: [{ association: 'role', attributes: ['role_id', 'role_name'] }],
  });

  let isNew = false;
  if (user) {
    if (!user.is_active) {
      throw new AppError('Tài khoản đã bị vô hiệu hóa', 403, 'FORBIDDEN');
    }
    // Liên kết google_id nếu trước đó là tài khoản local cùng email
    if (!user.google_id) {
      await user.update({ google_id: profile.sub });
    }
  } else {
    const userRole = await getUserRole();
    const randomHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
    const created = await UserAccount.create({
      username: await deriveUsername(email),
      password_hash: randomHash,
      full_name: profile.name,
      email,
      role_id: userRole.role_id,
      is_active: true,
      auth_provider: 'google',
      google_id: profile.sub,
    });
    user = await UserAccount.findByPk(created.user_id, {
      include: [{ association: 'role', attributes: ['role_id', 'role_name'] }],
    });
    isNew = true;
  }

  const token = signToken({ userId: user.user_id, roleName: user.role.role_name });
  return { user: formatUser(user), token, isNew };
};
