/**
 * @module middleware/errorHandler
 * @description Global Express error handler middleware for CrowdSphere AI.
 *   This is the last middleware registered in `app.js` and is responsible for
 *   translating all error objects — both expected `AppError` subclasses and
 *   unexpected runtime errors — into a consistent JSON HTTP response format.
 *
 *   The handler applies a two-tier strategy:
 *   - **Operational errors** (instances of `AppError` with `isOperational = true`):
 *     logged at `warn` level; HTTP status and error code from the error object
 *     are forwarded to the client as structured JSON.
 *   - **Unexpected errors** (programming bugs, unhandled rejections, third-party
 *     library exceptions): logged at `error` level with stack trace (non-prod
 *     only); the client receives a generic 500 response with no internal detail.
 *
 *   Stack traces are NEVER included in production API responses to prevent
 *   internal system detail from being exposed to potentially adversarial clients.
 *
 * @pr-changes
 *   - Added `requestId` to all error responses so clients can reference it in
 *     support tickets and ops engineers can look up the exact server trace.
 *   - Stack trace inclusion in non-production log entries is conditional on
 *     `config.nodeEnv !== 'production'` to prevent accidental exposure.
 *   - Switched from `console.error` to the structured `logger` to ensure error
 *     events are emitted in JSON format consistent with other log entries.
 *   - Separated warn-level logging for operational errors from error-level
 *     logging for unexpected crashes to enable alert routing in monitoring.
 *
 * @validation-review
 *   - The `eslint-disable-next-line no-unused-vars` comment before `errorHandler`
 *     is required because Express identifies error handlers by arity (4 params);
 *     removing `_next` would cause Express to treat it as a regular middleware.
 *   - `req.id || 'unknown'` fallback assumes `requestIdMiddleware` runs before
 *     any error is thrown; if an error occurs before that middleware executes
 *     (e.g. in `applyHelmet()`), `req.id` will be undefined and 'unknown' is used.
 *   - `err instanceof AppError && err.isOperational` is a double-check: `instanceof`
 *     guards against minification/transpilation scenarios where the class identity
 *     may not be preserved; `isOperational` guards against subclasses that do not
 *     set the flag.
 *   - The 500 response message is a static string; verify it matches the UX copy
 *     used in the fan-facing error display component.
 *
 * @scope-of-improvement
 *   - Emit a structured metrics event (e.g. increment a Prometheus counter) on
 *     each 5xx error to enable SLO-based alerting without log-parsing overhead.
 *   - Add error code normalisation for well-known third-party library errors
 *     (e.g. Mongoose `CastError`, Gemini SDK `QuotaExceededError`) so they are
 *     translated to appropriate `AppError` subclasses before reaching this handler.
 *   - Consider adding a correlation between `requestId` and a distributed trace
 *     span ID when OpenTelemetry is introduced.
 *   - Add a test that verifies stack traces are never serialised into production
 *     responses, to prevent future regressions from config/environment changes.
 *
 * @business-intent
 *   A consistent, predictable error response format lets the fan-facing React
 *   UI and the ops dashboard reliably parse error codes and display appropriate
 *   messages without brittle string matching. Suppressing internal error detail
 *   in production protects intellectual property (service architecture, library
 *   versions) and prevents information-disclosure attacks that could aid an
 *   adversary in targeting the system during a live stadium event.
 */

import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

/**
 * Global Express error handler — normalises all errors to a structured JSON response.
 *
 * @description
 *   Express recognises error-handling middleware by its 4-argument signature.
 *   This function MUST keep `_next` in its signature even though it is never
 *   called; removing it would silently demote the handler to a regular middleware,
 *   causing all errors to fall through to Express's default HTML error page.
 *
 *   Logs operational errors at `warn` level (expected, user-triggered) and
 *   unexpected errors at `error` level (require engineering attention). In
 *   non-production environments, stack traces are included in the error-level
 *   log entry for debugging but are NEVER included in the HTTP response body.
 *
 * @param {Error} err - The error object thrown or passed to `next(err)`.
 * @param {import('express').Request} req - The Express request (used for requestId and logging).
 * @param {import('express').Response} res - The Express response (used to send the error JSON).
 * @param {Function} _next - Required 4th parameter; intentionally unused (Express convention).
 * @returns {void} Sends an HTTP response; never calls `_next`.
 *
 * @risk-area
 *   This handler must NEVER forward raw `err.message` from unexpected errors to
 *   the client — those messages may contain file paths, SQL queries, API keys,
 *   or other sensitive internal information. Only `AppError.message` (explicitly
 *   crafted safe strings) should reach the client.
 *
 * @business-intent
 *   A single, well-tested error handler reduces the risk of inconsistent error
 *   responses causing the fan app to crash silently, and ensures every error —
 *   even unexpected ones — is logged with enough context for the ops team to
 *   diagnose incidents during live stadium events without needing to reproduce
 *   the issue in a development environment.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  // #What — Resolve the request trace ID for embedding in the response so
  //         the client can reference it in support requests.
  // #Uncertain — If requestIdMiddleware has not run (e.g. very early pipeline
  //   errors), req.id is undefined; 'unknown' is a safe fallback but makes
  //   log correlation impossible for those edge cases.
  const requestId = req.id || 'unknown';

  // #What — Check if the error is a known, expected operational error (an
  //         AppError instance with isOperational = true) vs. a programmer bug.
  if (err instanceof AppError && err.isOperational) {
    // #What — Log at 'warn' level: operational errors are expected user-
    //         triggered failures, not system health indicators. Warn-level
    //         logs should not page on-call engineers.
    // #Business-Intent — Separating warn (operational) from error (unexpected)
    //   levels allows monitoring to alert on error-level logs only, reducing
    //   alert fatigue while still capturing 4xx errors for UX analysis.
    logger.warn('Operational error', { code: err.code, message: err.message, requestId });

    // #What — Forward the AppError's own statusCode and human-safe message
    //         to the client inside the standard response envelope.
    return res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message },
      requestId,
    });
  }

  // #What — Unexpected error path: log full detail (with stack trace in non-
  //         prod) for post-incident analysis, but send only a generic message
  //         to the client to avoid information disclosure.
  // @hallucination-guard — If the error originates from AI output processing,
  //   the raw AI response should have been caught upstream and wrapped in an
  //   AIValidationError before reaching here. An unexpected error from an AI
  //   code path may indicate the hallucination guard was bypassed.
  // @human-approval-required — Unexpected errors in production should trigger
  //   an engineering alert; confirm monitoring is configured to page on
  //   error-level log entries with requestId for root-cause investigation.
  logger.error('Unexpected error', {
    message: err.message,
    requestId,
    // #What — Include the full stack trace in non-production log entries to
    //         accelerate debugging; explicitly exclude it in production to
    //         prevent internal file paths and line numbers from leaking.
    // #Risk-Area — This ternary is the sole guard against stack traces reaching
    //   production logs; verify config.nodeEnv is set correctly by the deployment
    //   pipeline and cannot be overridden by a malicious environment injection.
    ...(config.nodeEnv !== 'production' ? { stack: err.stack } : {}),
  });

  // #What — Return a static, safe 500 response; the requestId allows engineers
  //         to find the detailed server log without needing more client context.
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred. Please try again.' },
    requestId,
  });
}
