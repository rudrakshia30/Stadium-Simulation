/**
 * @module controllers/healthController
 * @description Health check controller for CrowdSphere AI.
 *   Provides a basic liveness endpoint used by monitoring systems, load balancers,
 *   and deployment checkers to verify the application process is running,
 *   initialized, and connected to its configured environment.
 *
 * @pr-changes
 *   - Implemented standard health check payload output.
 *   - Injected the current request tracing ID (`requestId`) to verify that the
 *     middleware stack is correctly processing request headers.
 *   - Exposed Gemini API availability flag (`geminiAvailable`).
 *
 * @validation-review
 *   - This endpoint is public and bypassed by authentication checks; do not
 *     expose sensitive environment variables or system paths in the response.
 *   - Response uses static version '1.0.0'.
 *
 * @business-intent
 *   Ensures that infrastructure automated systems can reliably check whether
 *   the CrowdSphere AI backend is operational before sending fan traffic,
 *   preventing downtime alerts from being missed.
 */

import { config } from '../config/index.js';

/**
 * GET /api/health
 * Verify that the backend service is operational and queryable.
 *
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {void}
 *
 * @business-intent
 *   Allows load balancers to route traffic away from this node if the process
 *   is unhealthy or shut down.
 */
export function healthCheck(req, res) {
  // #What — Return a standard 200 OK JSON payload containing status details.
  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv,
      // #What — Check if GEMINI_API_KEY is configured to confirm AI service availability.
      geminiAvailable: config.geminiApiKey.length > 0,
      version: '1.0.0',
    },
    // #What — Expose the request correlation ID to verify the middleware is active.
    requestId: req.id,
  });
}
