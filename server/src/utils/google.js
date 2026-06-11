import { OAuth2Client } from 'google-auth-library';
import { AppError } from './helpers.js';

// Đọc env lazy (import module chạy trước dotenv.config()).
const getClientId = () => process.env.GOOGLE_CLIENT_ID;

export const isGoogleConfigured = () => Boolean(getClientId());

let client = null;
const getClient = () => {
  const clientId = getClientId();
  if (!clientId) return null;
  if (!client) client = new OAuth2Client(clientId);
  return client;
};

/**
 * Verify Google ID token (lấy từ Google Sign-In ở client) và trả thông tin user.
 * @returns {{ sub, email, emailVerified, name }}
 */
export const verifyGoogleIdToken = async (idToken) => {
  const c = getClient();
  if (!c) {
    throw new AppError(
      'Đăng nhập Google chưa được cấu hình (thiếu GOOGLE_CLIENT_ID).',
      503,
      'GOOGLE_NOT_CONFIGURED',
    );
  }
  let ticket;
  try {
    ticket = await c.verifyIdToken({ idToken, audience: getClientId() });
  } catch {
    throw new AppError('Google token không hợp lệ hoặc đã hết hạn', 401, 'GOOGLE_TOKEN_INVALID');
  }
  const p = ticket.getPayload();
  if (!p?.email) {
    throw new AppError('Không lấy được email từ Google', 401, 'GOOGLE_TOKEN_INVALID');
  }
  return {
    sub: p.sub,
    email: p.email,
    emailVerified: Boolean(p.email_verified),
    name: p.name || p.email.split('@')[0],
  };
};
