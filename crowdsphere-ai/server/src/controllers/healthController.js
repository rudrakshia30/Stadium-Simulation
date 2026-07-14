/**
 * Health check controller.
 *
 * @module controllers/healthController
 */

import { config } from '../config/index.js';

/**
 * GET /api/health
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export function healthCheck(req, res) {
  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv,
      geminiAvailable: config.geminiApiKey.length > 0,
      version: '1.0.0',
    },
    requestId: req.id,
  });
}
