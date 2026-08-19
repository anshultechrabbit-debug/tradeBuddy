export class AppError extends Error {
  constructor(status, message, code = 'APP_ERROR', details = undefined) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class BadRequestError extends AppError {
  constructor(message, code = 'BAD_REQUEST', details) {
    super(400, message, code, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', code = 'UNAUTHORIZED') {
    super(401, message, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions', code = 'FORBIDDEN') {
    super(403, message, code);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', code = 'NOT_FOUND') {
    super(404, message, code);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists', code = 'CONFLICT') {
    super(409, message, code);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details) {
    super(422, message, 'VALIDATION_ERROR', details);
  }
}