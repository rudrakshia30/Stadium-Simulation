/**
 * Security middleware for CrowdSphere AI.
 * Applies HTTP security headers, CORS, rate limiting, and body limits.
 *
 * @module middleware/security
 */

import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';
import { generateRequestId } from '../utils/crypto.js';

/**
 * Apply Helmet security headers.
 * @returns {Function} Express middleware
 */
export function applyHelmet() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: config.isProduction ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  });
}

/**
 * CORS middleware restricted to configured origin.
 * @returns {Function} Express middleware
 */
export function applyCors() {
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin === config.clientOrigin) {
      res.setHeader('Access-Control-Allow-Origin', config.clientOrigin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Request-ID');
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  };
}

/**
 * General API rate limiter.
 * @returns {Function} Express middleware
 */
export function generalRateLimit() {
  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.' } },
  });
}

/**
 * Strict rate limiter for the login endpoint.
 * @returns {Function} Express middleware
 */
export function loginRateLimit() {
  return rateLimit({
    windowMs: config.loginRateLimit.windowMs,
    max: config.loginRateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many login attempts. Please try again later.' } },
  });
}

/**
 * Attach a unique request ID to every incoming request.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {Function} next
 */
export function requestIdMiddleware(req, res, next) {
  req.id = generateRequestId();
  res.setHeader('X-Request-ID', req.id);
  next();
}

/**
 * Request timeout middleware (10 seconds).
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {Function} next
 */
export function requestTimeout(req, res, next) {
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(503).json({
        success: false,
        error: { code: 'REQUEST_TIMEOUT', message: 'Request timed out. Please try again.' },
        requestId: req.id,
      });
    }
  }, 30000);

  res.on('finish', () => clearTimeout(timeout));
  res.on('close', () => clearTimeout(timeout));
  next();
}
