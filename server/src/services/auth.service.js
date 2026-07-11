import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Op } from 'sequelize';
import { Role, UserAccount } from '../models/index.js';
import { signToken } from '../utils/jwt.js';
import { AppError } from '../utils/helpers.js';
import { ROLES } from '../middleware/rbac.js';
import { sendPasswordResetEmail, sendVerificationEmail, isMailConfigured } from '../utils/mailer.js';
import { verifyGoogleIdToken } from '../utils/google.js';

const formatUser = (user) => ({
  userId: user.user_id,
  username: user.username,
  fullName: user.full_name,
  email: user.email,
  phone: user.phone,
  isActive: user.is_active,
  emailVerified: user.email_verified,
  authProvider: user.auth_provider,
  // Tài khoản ngân hàng nhận hoàn tiền hủy vé tháng (P3-8) — cập nhật qua PATCH /auth/me
  bankName: user.bank_name,
  bankAccountNumber: user.bank_account_number,
  bankAccountHolder: user.bank_account_holder,
  role: user.role
    ? { roleId: user.role.role_id, roleName: user.role.role_name }
    : null,
});

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

/**
 * Tài khoản LOCAL bắt buộc xác minh email mới được dùng hệ thống.
 * Tài khoản Google không đi qua đây (Google đã xác minh email — email_verified = true khi tạo).
 * Dùng chung cho login VÀ middleware auth (token cũ phát trước khi siết cũng bị chặn).
 */
export const assertEmailVerified = (user) => {
  if (user.auth_provider === 'local' && !user.email_verified) {
    throw new AppError(
      'Email chưa được xác minh. Kiểm tra hộp thư hoặc yêu cầu gửi lại liên kết xác minh.',
      403,
      'EMAIL_NOT_VERIFIED',
    );
  }
};

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

/** Sinh token xác minh, lưu hash + hạn, gửi mail (chỉ khi SMTP cấu hình; lỗi mail không chặn luồng). */
const issueVerificationEmail = async (user) => {
  const token = crypto.randomBytes(32).toString('hex');
  const ttlMin = Number(process.env.VERIFY_TOKEN_TTL_MINUTES) || 1440; // mặc định 24h
  await user.update({
    verification_token_hash: sha256(token),
    verification_token_expires: new Date(Date.now() + ttlMin * 60 * 1000),
  });
  if (!isMailConfigured()) return; // chưa cấu hình SMTP → bỏ qua gửi, không lỗi
  // Link bấm-được: trỏ thẳng vào endpoint GET của BE (vì click email = GET). FE chưa có trang này.
  const apiBase = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 5000}`;
  const verifyUrl = `${apiBase}/api/auth/verify-email?token=${token}&email=${encodeURIComponent(user.email)}`;
  try {
    await sendVerificationEmail(user.email, verifyUrl);
  } catch {
    // Gửi mail lỗi (mạng/SMTP) KHÔNG chặn đăng ký — user có thể gọi /resend-verification.
  }
};

export const register = async ({ username, password, fullName, email, phone }) => {
  const normalizedEmail = (email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    throw new AppError('Email là bắt buộc', 400, 'VALIDATION_ERROR');
  }
  // Xác minh email nay là BẮT BUỘC → không có kênh gửi mail thì tài khoản tạo ra sẽ không bao
  // giờ đăng nhập được. Thà chặn ngay còn hơn đẻ ra tài khoản chết.
  if (!isMailConfigured()) {
    throw new AppError(
      'Hệ thống gửi email chưa được cấu hình — tạm thời không thể đăng ký. Vui lòng thử lại sau.',
      503,
      'MAIL_NOT_CONFIGURED',
    );
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
    email_verified: false,
  });

  await issueVerificationEmail(user);

  // KHÔNG phát JWT ở đây: phát token lúc này thì user chưa xác minh vẫn gọi được API,
  // vô hiệu hóa toàn bộ việc chặn login bên dưới. Phải verify rồi đăng nhập.
  return {
    user: formatUser(await withRole(user.user_id)),
    emailVerificationSent: true,
    message: 'Đăng ký thành công. Mở email và bấm liên kết xác minh trước khi đăng nhập.',
  };
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

  // Chặn đăng nhập khi chưa xác minh email. Đặt SAU khi so mật khẩu: người ngoài đoán mò
  // username sẽ luôn nhận 401 giống nhau, chỉ chủ tài khoản (biết mật khẩu) mới thấy 403 này.
  assertEmailVerified(user);

  const token = signToken({ userId: user.user_id, roleName: user.role.role_name });
  return { user: formatUser(user), token };
};

export const getMe = async (userId) => {
  const user = await withRole(userId);
  if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');
  return formatUser(user);
};

/**
 * P3-8 — User tự cập nhật hồ sơ (họ tên, SĐT, tài khoản ngân hàng nhận hoàn tiền).
 * Chỉ nhận đúng các field cho phép — username/email/role không đổi qua đây.
 */
export const updateMe = async (userId, data) => {
  const user = await withRole(userId);
  if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');

  const updates = {};
  if (data.fullName !== undefined) updates.full_name = String(data.fullName).trim();
  if (data.phone !== undefined) updates.phone = data.phone ? String(data.phone).trim() : null;
  if (data.bankName !== undefined) updates.bank_name = data.bankName ? String(data.bankName).trim() : null;
  if (data.bankAccountNumber !== undefined) {
    updates.bank_account_number = data.bankAccountNumber ? String(data.bankAccountNumber).trim() : null;
  }
  if (data.bankAccountHolder !== undefined) {
    updates.bank_account_holder = data.bankAccountHolder ? String(data.bankAccountHolder).trim() : null;
  }
  if (Object.keys(updates).length === 0) {
    throw new AppError('Không có thông tin nào để cập nhật', 400, 'VALIDATION_ERROR');
  }

  await user.update(updates);
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

/** Xác minh email bằng token gửi qua mail lúc đăng ký. */
export const verifyEmail = async ({ email, token }) => {
  const normalizedEmail = (email || '').trim().toLowerCase();
  const user = await UserAccount.unscoped().findOne({ where: { email: normalizedEmail } });
  const tokenMatches =
    !!user && !!token && !!user.verification_token_hash &&
    user.verification_token_hash === sha256(token);

  // Bấm LẠI link cũ sau khi đã xác minh → vẫn báo thành công (không bắt lỗi vô cớ), nhưng
  // phải đúng token. Trả "đã xác minh" cho email bất kỳ sẽ thành kênh dò email nào có thật.
  if (user && user.email_verified) {
    if (tokenMatches) return { message: 'Email đã được xác minh.' };
    throw new AppError('Liên kết xác minh không hợp lệ hoặc đã hết hạn', 400, 'VERIFY_TOKEN_INVALID');
  }

  if (
    !tokenMatches ||
    !user.verification_token_expires ||
    new Date(user.verification_token_expires) < new Date()
  ) {
    throw new AppError('Liên kết xác minh không hợp lệ hoặc đã hết hạn', 400, 'VERIFY_TOKEN_INVALID');
  }

  // Giữ lại hash (KHÔNG null) để lần bấm lại vẫn khớp token ở nhánh trên; token đã dùng xong
  // không còn tác dụng gì vì email_verified = true. Xóa hạn để nó không còn "sống".
  await user.update({
    email_verified: true,
    verification_token_expires: null,
  });
  return { message: 'Xác minh email thành công.' };
};

/** Gửi lại email xác minh (nếu user tồn tại, là tài khoản local, chưa verify). */
export const resendVerification = async ({ email }) => {
  const normalizedEmail = (email || '').trim().toLowerCase();
  const user = await UserAccount.unscoped().findOne({ where: { email: normalizedEmail } });

  // Luôn trả message chung — không lộ email có tồn tại / đã verify hay chưa.
  if (user && user.auth_provider === 'local' && !user.email_verified) {
    await issueVerificationEmail(user);
  }
  return { message: 'Nếu email tồn tại và chưa xác minh, link xác minh mới đã được gửi.' };
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
    // Liên kết google_id nếu trước đó là tài khoản local cùng email.
    if (!user.google_id) {
      const updates = { google_id: profile.sub };
      // Chống pre-account-takeover: tài khoản local cùng email nhưng CHƯA xác minh
      // có thể do người khác đăng ký hờ để cài sẵn mật khẩu. Google đã xác minh
      // người đăng nhập là chủ email → vô hiệu mật khẩu cũ + coi email đã xác minh
      // (chủ thật vẫn đặt lại được mật khẩu qua quên-mật-khẩu nếu muốn dùng local).
      if (!user.email_verified) {
        updates.password_hash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
        updates.email_verified = true;
        updates.verification_token_hash = null;
        updates.verification_token_expires = null;
      }
      await user.update(updates);
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
      email_verified: true,
    });
    user = await UserAccount.findByPk(created.user_id, {
      include: [{ association: 'role', attributes: ['role_id', 'role_name'] }],
    });
    isNew = true;
  }

  const token = signToken({ userId: user.user_id, roleName: user.role.role_name });
  return { user: formatUser(user), token, isNew };
};
