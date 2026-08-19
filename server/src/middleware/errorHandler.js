import { AppError } from '../utils/errors.js';
import { logInfra } from '../utils/helpers.js';
import { config } from '../config/env.js';

export function notFound(req, _res, next) {
  const err = new AppError(404, `Route not found: ${req.method} ${req.path}`, 'NOT_FOUND');
  next(err);
}

export function errorHandler(err, req, res, _next) {
  const status = err instanceof AppError ? err.status : 500;
  const code = err instanceof AppError ? err.code : 'INTERNAL_ERROR';
  const message = err instanceof AppError ? err.message : 'Internal server error';

  if (status >= 500) {
    logInfra('error', 'http', `${req.method} ${req.path} → ${message}`, { stack: err.stack });
  }

  if (!res.headersSent) {
    res.status(status).json({
      error: {
        code,
        message,
        ...(err.details ? { details: err.details } : {}),
        ...(config.isProduction ? {} : { stack: err.stack }),
      },
    });
  } else {
    res.end();
  }
}