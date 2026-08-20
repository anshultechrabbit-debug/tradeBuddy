import { validationResult } from 'express-validator';
import { ValidationError } from './errors.js';

export function validate(req, _res, next) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    const details = result.array().map((e) => ({ field: e.path, message: e.msg }));
    const summary = details.map((d) => `${d.field}: ${d.message}`).join('; ');
    return next(new ValidationError(details.length ? `Validation failed: ${summary}` : 'Validation failed', details));
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