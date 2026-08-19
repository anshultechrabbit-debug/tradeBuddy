import { validationResult } from 'express-validator';
import { ValidationError } from './errors.js';

export function validate(req, _res, next) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    return next(
      new ValidationError(
        'Validation failed',
        result.array().map((e) => ({ field: e.path, message: e.msg })),
      ),
    );
  }
  return next();
}

export function pagination(req, _res, next) {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  req.pagination = { page, limit, offset: (page - 1) * limit };
  next();
}

export function paginatedResult({ rows, total, page, limit }) {
  return {
    data: rows,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}