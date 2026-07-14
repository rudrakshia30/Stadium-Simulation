/**
 * Global error handler middleware.
 * Formats errors consistently and never exposes stack traces in production.
 *
 * @module middleware/errorHandler
 */

import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

/**
 * Express error handler (4 arguments required by Express).
 *
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {Function} _next
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  const requestId = req.id || 'unknown';

  if (err instanceof AppError && err.isOperational) {
    logger.warn('Operational error', { code: err.code, message: err.message, requestId });
    return res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message },
      requestId,
    });
  }

  // Unexpected error
  logger.error('Unexpected error', {
    message: err.message,
    requestId,
    ...(config.nodeEnv !== 'production' ? { stack: err.stack } : {}),
  });

  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred. Please try again.' },
    requestId,
  });
}
