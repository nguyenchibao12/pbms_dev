import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

const isProduction = process.env.NODE_ENV === 'production';

export const securityHeaders = helmet({
  contentSecurityPolicy: isProduction ? undefined : false,
  crossOriginEmbedderPolicy: false,
});

export const jsonParserLimit = '1mb';

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 30 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many auth attempts. Try again later.' },
  },
});

export const getCorsOrigin = () => {
  const origin = process.env.CLIENT_URL || 'http://localhost:5173';
  if (isProduction && (origin === '*' || !origin)) {
    throw new Error('CLIENT_URL must be set to a specific origin in production');
  }
  return origin;
};
