import { AppError } from '../utils/helpers.js';

export const errorHandler = (err, req, res, _next) => {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const isProd = process.env.NODE_ENV === 'production';
  const message =
    isProd && statusCode >= 500 ? 'Internal server error' : err.message || 'Internal server error';

  if (process.env.NODE_ENV === 'development') {
    console.error(err);
  }

  res.status(statusCode).json({
    success: false,
    error: { code, message },
  });
};

export const notFoundHandler = (req, res, next) => {
  next(new AppError(`Route ${req.originalUrl} not found`, 404, 'NOT_FOUND'));
};
