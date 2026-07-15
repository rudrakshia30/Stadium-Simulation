/**
 * @module utils/errors
 * @description Custom application error class hierarchy for CrowdSphere AI.
 *   All intentional, user-safe errors extend `AppError` so the global error
 *   handler can distinguish expected operational errors (wrong input, expired
 *   tokens, rate limits) from truly unexpected runtime failures (unhandled
 *   promise rejections, programming bugs).
 *
 *   Error hierarchy:
 *   ```
 *   Error
 *   └── AppError           (base; isOperational = true)
 *       ├── ValidationError  400
 *       ├── AuthError        401
 *       ├── ForbiddenError   403
 *       ├── NotFoundError    404
 *       ├── RateLimitError   429
 *       ├── AIServiceError   502
 *       └── AIValidationError 502
 *   ```
 *
 * @pr-changes
 *   - Introduced `AIValidationError` (HTTP 502) to surface cases where the
 *     Gemini response schema fails server-side validation.
 *   - Added `isOperational = true` flag to `AppError` so the error handler
 *     can cleanly distinguish app errors from unexpected crashes.
 *   - Used `Error.captureStackTrace` where available (V8 engines) to produce
 *     cleaner stack traces that exclude the error constructor frame.
 *
 * @validation-review
 *   - All error messages passed to constructors become user-facing API
 *     responses; ensure no internal system detail (DB query, file path, etc.)
 *     is ever passed as the `message` argument.
 *   - `AIServiceError` and `AIValidationError` both use HTTP 502; consumers
 *     must check the `code` field to distinguish them programmatically.
 *   - Default messages in each subclass must be reviewed for clarity with
 *     non-technical stadium fan users who may see them in the UI.
 *
 * @scope-of-improvement
 *   - Add an optional `details` field to `AppError` for structured error
 *     metadata (e.g. which field failed validation) while keeping it out of
 *     the user-facing message.
 *   - Consider adding `ConflictError` (409) and `ServiceUnavailableError` (503)
 *     as the product matures and new failure modes are discovered.
 *   - Internationalise default error messages for multi-language stadium
 *     deployments; store message keys rather than English strings.
 *   - Add unit tests that assert `instanceof AppError`, `statusCode`, and
 *     `isOperational` for each subclass to prevent regressions.
 *
 * @business-intent
 *   Structured error classes ensure the API always returns consistent JSON
 *   error shapes, which the React fan-facing UI and ops dashboard both depend
 *   on for graceful error display. Using a flag (`isOperational`) instead of
 *   class-name string matching makes the error-handling logic robust against
 *   minification and transpilation.
 */

/**
 * Base application error class.
 *
 * @description
 *   All intentional errors thrown by CrowdSphere AI server logic should extend
 *   this class. The `isOperational` flag set to `true` signals to the global
 *   error handler that the error is expected and safe to surface to the client,
 *   unlike unhandled JavaScript runtime errors which should result in a generic
 *   500 response.
 *
 * @risk-area
 *   The `message` parameter becomes a user-visible API error string. Never pass
 *   raw internal error messages (e.g. from database drivers, file system, or
 *   third-party SDKs) as the `message` here — always wrap them in a safe,
 *   generic description.
 *
 * @business-intent
 *   Distinguishing operational errors (user mistakes, token expiry) from
 *   unexpected crashes allows the ops team to monitor the error rate for each
 *   category separately, enabling targeted SLA alerting (e.g. 5xx spikes
 *   trigger PagerDuty; 4xx spikes trigger UX review).
 */
export class AppError extends Error {
  /**
   * @description Constructs an AppError with HTTP metadata attached.
   * @param {string} message - User-facing, safe error description.
   * @param {number} statusCode - HTTP status code to send in the response.
   * @param {string} code - Machine-readable error code (e.g. 'VALIDATION_ERROR').
   * @returns {AppError}
   */
  constructor(message, statusCode, code) {
    // #What — Call Error constructor to set the message property and populate
    //         the default stack trace.
    super(message);

    // #What — Set the error name to the concrete subclass name (e.g. 'AuthError')
    //         rather than 'Error' for clearer log output and `instanceof` support.
    this.name = this.constructor.name;

    this.statusCode = statusCode;
    this.code = code;

    // #What — Mark this error as an expected, handled operational error so the
    //         global error handler does NOT treat it as a programmer bug.
    // #Business-Intent — isOperational = true errors become structured 4xx/5xx
    //   responses; errors without this flag become opaque 500 responses to
    //   prevent internal system detail from leaking to clients.
    this.isOperational = true;

    // #What — V8-specific optimisation: removes this constructor from the stack
    //         trace so the trace starts at the actual throw site, not here.
    // #Uncertain — `Error.captureStackTrace` is undefined on non-V8 runtimes
    //   (Deno, Bun without V8 compat, edge workers); the guard handles that.
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * HTTP 400 — Validation error.
 *
 * @description
 *   Thrown when incoming request data fails schema or semantic validation,
 *   such as a missing required field, an out-of-range value, or a message
 *   that exceeds the configured character limit.
 *
 * @business-intent
 *   Explicit validation errors allow the fan-facing UI to show helpful,
 *   actionable feedback ("message too long") rather than a generic failure.
 */
export class ValidationError extends AppError {
  /**
   * @param {string} [message='Invalid request data'] - Specific validation failure description.
   * @returns {ValidationError}
   */
  constructor(message = 'Invalid request data') {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

/**
 * HTTP 401 — Authentication error.
 *
 * @description
 *   Thrown when a request to a protected endpoint arrives without a valid
 *   JWT token, or when the token is expired, malformed, or signed with the
 *   wrong secret.
 *
 * @risk-area
 *   Ensure the error message does not reveal whether the token was absent,
 *   expired, or invalid in cases where that distinction could aid enumeration
 *   attacks on the ops login endpoint.
 *
 * @business-intent
 *   Ops staff must always be authenticated before executing crowd-management
 *   commands; returning 401 instead of silently ignoring the request ensures
 *   the ops dashboard always shows a clear "session expired, re-login" prompt.
 */
export class AuthError extends AppError {
  /**
   * @param {string} [message='Authentication required'] - Context-specific auth failure reason.
   * @returns {AuthError}
   */
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTH_ERROR');
  }
}

/**
 * HTTP 403 — Forbidden / access denied error.
 *
 * @description
 *   Thrown when a valid, authenticated user attempts to access a resource or
 *   perform an action they are not authorised for (e.g. a fan-role token
 *   accessing an ops-only endpoint).
 *
 * @risk-area
 *   Must be clearly differentiated from AuthError (401); a 403 should never
 *   be returned for unauthenticated requests as it leaks the existence of the
 *   resource to unauthenticated callers.
 */
export class ForbiddenError extends AppError {
  /**
   * @param {string} [message='Access denied'] - Human-readable denial reason.
   * @returns {ForbiddenError}
   */
  constructor(message = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
  }
}

/**
 * HTTP 404 — Resource not found error.
 *
 * @description
 *   Thrown when a requested resource (venue, seat row, alert ID, etc.) does
 *   not exist in the data store or fixture data. The global 404 route handler
 *   in `app.js` handles missing *endpoints*; this error handles missing
 *   *resources within* existing endpoints.
 */
export class NotFoundError extends AppError {
  /**
   * @param {string} [message='Resource not found'] - Description of what was not found.
   * @returns {NotFoundError}
   */
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

/**
 * HTTP 429 — Rate limit exceeded error.
 *
 * @description
 *   Thrown (or returned automatically by express-rate-limit) when a client
 *   exceeds the request quota for a given time window. Used for both the
 *   general API limiter and the stricter login limiter.
 *
 * @business-intent
 *   Protects Gemini API quota during high-footfall match days where concurrent
 *   fan queries can spike significantly; also mitigates credential-stuffing
 *   against the ops login endpoint.
 */
export class RateLimitError extends AppError {
  /**
   * @param {string} [message='Too many requests'] - Context about which limit was hit.
   * @returns {RateLimitError}
   */
  constructor(message = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

/**
 * HTTP 502 — AI service unavailable error.
 *
 * @description
 *   Thrown when the Gemini API call fails due to a network error, quota
 *   exhaustion, or an upstream service outage. Signals that the failure is
 *   external to CrowdSphere AI rather than a bug in our application code.
 *
 * @risk-area
 *   Do not wrap raw SDK error messages (which may contain API keys or internal
 *   URLs) in this error's message — always use a safe, generic description.
 *
 * @business-intent
 *   Surfacing a 502 (Bad Gateway) rather than 500 allows the ops dashboard to
 *   display "AI assistant temporarily unavailable" and redirect fans to human
 *   stewards, maintaining safety communication during outages.
 */
export class AIServiceError extends AppError {
  /**
   * @param {string} [message='AI service unavailable'] - Safe external description.
   * @returns {AIServiceError}
   */
  constructor(message = 'AI service unavailable') {
    super(message, 502, 'AI_SERVICE_ERROR');
  }
}

/**
 * HTTP 502 — AI output validation failure error.
 *
 * @description
 *   Thrown when the Gemini model returns a response that passes HTTP-level
 *   success but fails server-side structural or content validation checks
 *   (e.g. missing required JSON fields, unexpected tool call format, or
 *   content that triggers the hallucination guard).
 *
 * @risk-area
 *   This error class is the primary signal that AI output is untrusted.
 *   Any handler receiving this error must NOT forward the raw AI response
 *   to the client without human review of the validation logic.
 *
 * @business-intent
 *   AI outputs that fail validation must never reach fans or ops staff
 *   unfiltered; in a safety-critical stadium context, a hallucinated
 *   evacuation route or incorrect gate number could cause physical harm.
 *
 * @validation-note
 *   Controllers should catch this error, log the raw AI response at debug
 *   level for post-incident analysis, and return a safe fallback message.
 */
export class AIValidationError extends AppError {
  /**
   * @param {string} [message='AI response validation failed'] - Description of what failed.
   * @returns {AIValidationError}
   */
  // @hallucination-guard — This error class is specifically for flagging AI outputs
  //   that did not pass server-side schema or content checks.
  constructor(message = 'AI response validation failed') {
    super(message, 502, 'AI_VALIDATION_ERROR');
  }
}
