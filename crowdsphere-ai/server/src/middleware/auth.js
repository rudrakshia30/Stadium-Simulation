/**
 * JWT authentication middleware for protected operations routes.
 *
 * @module middleware/auth
 */

import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { AuthError } from '../utils/errors.js';

/**
 * Verify the JWT from the HttpOnly ops_token cookie.
 * Attaches req.user on success.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {Function} next
 */
export function requireAuth(req, res, next) {
  let token = req.cookies?.ops_token;

  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(new AuthError('Operations access token required'));
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = { role: decoded.role || 'operations' };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AuthError('Session expired. Please log in again.'));
    }
    return next(new AuthError('Invalid access token'));
  }
}
