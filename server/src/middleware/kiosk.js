import { AppError } from '../utils/helpers.js';

/**
 * Bảo vệ endpoint kiosk cổng: yêu cầu header `X-Kiosk-Key` khớp env KIOSK_API_KEY.
 * Dùng cho màn hình gắn ở cổng (tự phục vụ, không cần đăng nhập staff).
 */
export const kioskAuth = (req, _res, next) => {
  const expected = process.env.KIOSK_API_KEY;
  if (!expected) {
    return next(
      new AppError('Kiosk chưa được cấu hình (thiếu KIOSK_API_KEY).', 503, 'KIOSK_NOT_CONFIGURED'),
    );
  }
  const provided = req.get('X-Kiosk-Key');
  if (!provided || provided !== expected) {
    return next(new AppError('Kiosk key không hợp lệ.', 401, 'UNAUTHORIZED'));
  }
  return next();
};
