/**
 * Custom application error classes.
 * All errors extend AppError so the error handler can distinguish app errors
 * from unexpected runtime errors.
 *
 * @module utils/errors
 */

/**
 * Base application error.
 */
export class AppError extends Error {
  /**
   * @param {string} message - User-facing safe message
   * @param {number} statusCode - HTTP status code
   * @param {string} code - Machine-readable error code
   */
  constructor(message, statusCode, code) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
  }
}

/** 400 — Invalid request input */
export class ValidationError extends AppError {
  constructor(message = 'Invalid request data') {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

/** 401 — Authentication required */
export class AuthError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTH_ERROR');
  }
}

/** 403 — Access denied */
export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
  }
}

/** 404 — Resource not found */
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

/** 429 — Rate limit exceeded */
export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

/** 502 — AI service error */
export class AIServiceError extends AppError {
  constructor(message = 'AI service unavailable') {
    super(message, 502, 'AI_SERVICE_ERROR');
  }
}

/** 502 — AI output failed validation */
export class AIValidationError extends AppError {
  constructor(message = 'AI response validation failed') {
    super(message, 502, 'AI_VALIDATION_ERROR');
  }
}
