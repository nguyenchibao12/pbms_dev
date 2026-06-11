import { verifyToken } from '../utils/jwt.js';
import { AppError } from '../utils/helpers.js';
import { UserAccount } from '../models/index.js';

export const auth = async (req, _res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const token = header.split(' ')[1];
    const decoded = verifyToken(token);

    const user = await UserAccount.findByPk(decoded.userId, {
      include: [{ association: 'role', attributes: ['role_id', 'role_name'] }],
    });

    if (!user || !user.is_active) {
      throw new AppError('Invalid or inactive account', 401, 'UNAUTHORIZED');
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return next(new AppError('Invalid or expired token', 401, 'UNAUTHORIZED'));
    }
    next(err);
  }
};
