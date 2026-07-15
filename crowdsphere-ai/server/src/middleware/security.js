/**
 * @module middleware/security
 * @description HTTP security middleware stack for CrowdSphere AI.
 *   Provides five composable middleware factories and functions that together
 *   form the outermost security perimeter of the API:
 *
 *   1. `applyHelmet()` — Sets defensive HTTP response headers (CSP, HSTS,
 *      X-Frame-Options, etc.) via the `helmet` package.
 *   2. `applyCors()` — Manual single-origin CORS enforcement with credentials
 *      support; rejects cross-origin requests from unlisted origins.
 *   3. `generalRateLimit()` — 100 req / 15 min per IP on all /api/* routes.
 *   4. `loginRateLimit()` — 10 req / 15 min per IP on the login endpoint only.
 *   5. `requestIdMiddleware` — Attaches a CSPRNG hex ID to every request and
 *      reflects it in the `X-Request-ID` response header.
 *   6. `requestTimeout` — Enforces a 30-second server-side request deadline;
 *      returns a 503 JSON response if the deadline is exceeded.
 *
 * @pr-changes
 *   - Replaced `cors` npm package with a manual CORS middleware to support
 *     `credentials: true` with a strict single-origin allowlist.
 *   - Added `requestTimeout` middleware with a 30-second ceiling to protect
 *     against slow AI responses holding connections open indefinitely.
 *   - `requestIdMiddleware` now uses `generateRequestId()` from `utils/crypto`
 *     (CSPRNG) instead of a UUID library to reduce dependencies.
 *   - CSP `upgradeInsecureRequests` directive is conditionally omitted in
 *     non-production environments to allow HTTP dev server connections.
 *
 * @validation-review
 *   - CORS origin comparison (`origin === config.clientOrigin`) is strict
 *     string equality; wildcard or prefix matching is intentionally absent.
 *     Adding any new client origin requires a config change AND a code review.
 *   - The 30-second request timeout is a global default; AI endpoints may need
 *     individual longer timeouts if multi-round tool calling is extended.
 *   - `crossOriginEmbedderPolicy: false` is set in Helmet config; review
 *     whether COEP can be enabled once iframe embedding requirements are known.
 *   - `standardHeaders: true` in rate limiters sends `RateLimit-*` headers per
 *     draft-ietf-httpapi-ratelimit-headers; verify client UIs handle them.
 *   - The 30-second timeout setTimeout reference is cleared on both `finish`
 *     and `close` events; confirm `close` fires on client-aborted requests in
 *     the target Node.js/Express version.
 *
 * @scope-of-improvement
 *   - Extract the 30-second timeout constant into `config` so it can be tuned
 *     per environment and route type without a code change.
 *   - Add per-IP rate-limit bypass list for internal health-check probes that
 *     should not count against quotas.
 *   - Evaluate adding `Permissions-Policy` header via Helmet to restrict
 *     browser API access (camera, microphone, geolocation) for the web client.
 *   - Consider adding `helmet.hsts()` with `includeSubDomains: true` and a
 *     `preload` submission for production domains.
 *   - Replace the manual CORS middleware with the `cors` npm package plus a
 *     dynamic origin callback when multi-tenant white-labelling is introduced.
 *
 * @business-intent
 *   Security middleware sits at the outermost layer of every API request,
 *   protecting both fan users and venue operations staff from common web
 *   attack vectors (XSS via CSP, clickjacking via X-Frame-Options, CSRF via
 *   strict CORS, credential stuffing via login rate limits). In a stadium
 *   context where thousands of concurrent users interact with crowd-management
 *   AI, a single exploitable header misconfiguration could compromise the
 *   safety communication channel for the entire event.
 */

import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';
import { generateRequestId } from '../utils/crypto.js';

/**
 * Create and return a configured Helmet middleware instance.
 *
 * @description
 *   Applies a restrictive Content Security Policy (CSP) that whitelists only
 *   same-origin resources, prevents inline script execution, and (in production)
 *   upgrades insecure HTTP sub-resource requests to HTTPS. Also disables the
 *   `crossOriginEmbedderPolicy` header to allow the React dev server to embed
 *   the API without COEP handshake errors.
 *
 * @returns {Function} An Express middleware function that sets security headers.
 *
 * @risk-area
 *   The CSP `styleSrc` allows `'unsafe-inline'` for styles, which partially
 *   undermines XSS protection for CSS injection. Review whether the React
 *   client can be refactored to use nonce-based or hashed styles instead.
 *
 * @business-intent
 *   CSP and other Helmet headers protect the stadium fan web application from
 *   XSS attacks that could display false evacuation instructions or hijack
 *   the AI chat session to exfiltrate conversation history.
 */
export function applyHelmet() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        // #What — Only allow resources (scripts, frames, connections) from the
        //         same origin by default; everything else is blocked.
        defaultSrc: ["'self'"],

        // #What — Prevent execution of inline scripts and external script sources
        //         to mitigate XSS attacks injecting malicious JavaScript.
        // #Risk-Area — If a future feature requires a third-party script (analytics,
        //   maps), it must be added here with the specific domain, not a wildcard.
        scriptSrc: ["'self'"],

        // #What — Allow inline styles (needed by most CSS-in-JS / Tailwind setups)
        //         but restrict external style sheets to same origin only.
        // #Uncertain — 'unsafe-inline' for styles is a CSP-level 2 weakness; assess
        //   whether nonce-based or hash-based allowlisting is feasible with the
        //   current React build toolchain.
        styleSrc: ["'self'", "'unsafe-inline'"],

        // #What — Allow same-origin images plus inline data URIs (for base64
        //         icons and QR code images used in the fan UI).
        imgSrc: ["'self'", 'data:'],

        // #What — Restrict XHR/Fetch/WebSocket connections to same origin so
        //         the browser cannot be used as a proxy to third-party services.
        connectSrc: ["'self'"],

        fontSrc: ["'self'"],

        // #What — Block <object>, <embed>, <applet> elements entirely; these
        //         legacy plugin hosts are a common XSS vector.
        objectSrc: ["'none'"],

        // #What — In production, instruct browsers to upgrade any inadvertent
        //         HTTP sub-resource requests to HTTPS automatically.
        // #Business-Intent — Prevents mixed-content warnings and man-in-the-middle
        //   downgrade attacks in production stadium Wi-Fi environments.
        upgradeInsecureRequests: config.isProduction ? [] : null,
      },
    },
    // #What — Disable Cross-Origin-Embedder-Policy to prevent COEP blocking
    //         the React dev server's hot-reload proxy setup.
    // #Uncertain — This should be re-evaluated and potentially enabled when the
    //   production client deployment architecture is finalised.
    crossOriginEmbedderPolicy: false,
  });
}

/**
 * Create and return a manual CORS enforcement middleware.
 *
 * @description
 *   Compares the incoming request `Origin` header against the single
 *   configured `clientOrigin`. If they match, the appropriate CORS response
 *   headers are added, including `Access-Control-Allow-Credentials: true` so
 *   the browser sends the HttpOnly JWT cookie. Preflight (OPTIONS) requests
 *   are short-circuited with a 204 No Content response. Non-matching origins
 *   receive no CORS headers and will be blocked by the browser's SOP.
 *
 * @returns {Function} Express middleware `(req, res, next) => void`.
 *
 * @risk-area
 *   `Access-Control-Allow-Credentials: true` combined with a reflected origin
 *   is a dangerous CORS misconfiguration pattern — but safe here ONLY because
 *   the origin is compared to a single hardcoded config value, NOT reflected
 *   from the request. Never change this to reflect `req.headers.origin`
 *   unconditionally.
 *
 * @business-intent
 *   HttpOnly cookies (used for JWT transport) require CORS credentials support
 *   to be sent cross-origin. Restricting this to a single, explicitly configured
 *   origin prevents any other website from making credentialed API calls on
 *   behalf of an authenticated ops staff member.
 */
export function applyCors() {
  return (req, res, next) => {
    const origin = req.headers.origin;

    // #What — Strict equality check: only the exact configured client origin
    //         receives CORS headers; all other origins are silently excluded.
    // #Risk-Area — DO NOT change this to a substring match or regex; an origin
    //   like `http://evil-crowdsphere-ai.com` would match a naive prefix check.
    if (origin === config.clientOrigin) {
      // #What — Reflect the allowed origin explicitly (not '*') so credentials
      //         (cookies) are permitted by the browser's CORS spec enforcement.
      res.setHeader('Access-Control-Allow-Origin', config.clientOrigin);

      // #What — Allow the browser to include cookies (HttpOnly ops_token JWT)
      //         in cross-origin requests to this API.
      res.setHeader('Access-Control-Allow-Credentials', 'true');

      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

      // #What — Allowlist headers the client is permitted to send; X-Request-ID
      //         allows the frontend to pass its own trace correlation ID.
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Request-ID, Authorization');
    }

    // #What — Handle CORS preflight requests: browsers send an OPTIONS request
    //         before credentialed cross-origin POSTs; return 204 to complete
    //         the preflight handshake without hitting route handlers.
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }

    next();
  };
}

/**
 * Create and return the general API rate limiter middleware.
 *
 * @description
 *   Applies a sliding-window rate limit of `config.rateLimit.max` requests
 *   per `config.rateLimit.windowMs` milliseconds per IP address across all
 *   `/api/*` routes. Uses `express-rate-limit` with RFC-compliant
 *   `RateLimit-*` response headers (legacy `X-RateLimit-*` headers are
 *   disabled).
 *
 * @returns {Function} An Express middleware function.
 *
 * @business-intent
 *   Protects the CrowdSphere AI Gemini API quota from being exhausted by a
 *   single client (automated bots, misbehaving mobile apps) during match days
 *   when the system is under peak load, ensuring fair access for all fans.
 */
export function generalRateLimit() {
  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,

    // #What — Use the draft IETF standard RateLimit-* headers instead of the
    //         older X-RateLimit-* convention for forward compatibility.
    standardHeaders: true,
    legacyHeaders: false,

    // #What — Return a structured JSON error body consistent with the rest of
    //         the API error format when the rate limit is breached.
    message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.' } },
  });
}

/**
 * Create and return a strict rate limiter for the login endpoint.
 *
 * @description
 *   Applies a tighter sliding-window rate limit of `config.loginRateLimit.max`
 *   attempts per `config.loginRateLimit.windowMs` milliseconds per IP. This
 *   is mounted exclusively on the ops login route to slow down credential-
 *   stuffing or brute-force attacks on the OPS_ACCESS_CODE.
 *
 * @returns {Function} An Express middleware function.
 *
 * @risk-area
 *   If an IP is shared by multiple ops staff (e.g. behind a NAT), the tight
 *   limit (10 attempts / 15 min) may inadvertently lock out legitimate users.
 *   Consider switching to a per-user or per-account limit when user accounts
 *   are introduced.
 *
 * @business-intent
 *   The ops access code guards crowd-management commands. Slowing brute-force
 *   guessing to 10 attempts per 15 minutes means even a 6-character numeric
 *   code would take thousands of hours to crack, providing defence-in-depth
 *   alongside the constant-time comparison in utils/crypto.
 */
export function loginRateLimit() {
  return rateLimit({
    windowMs: config.loginRateLimit.windowMs,
    max: config.loginRateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,

    // #Business-Intent — A specific message for login rate limiting helps ops
    //   staff understand they must wait before retrying, preventing repeated
    //   lockouts from rapid retry behaviour.
    message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many login attempts. Please try again later.' } },
  });
}

/**
 * Attach a unique cryptographically secure request ID to every incoming request.
 *
 * @description
 *   Generates a 16-character hex random ID using the CSPRNG-backed
 *   `generateRequestId()` utility, attaches it to `req.id`, and reflects it
 *   in the `X-Request-ID` response header so clients can correlate their
 *   request with server-side log entries when reporting issues.
 *
 * @param {import('express').Request} req - The incoming Express request object.
 * @param {import('express').Response} res - The outgoing Express response object.
 * @param {Function} next - The next middleware function in the stack.
 * @returns {void}
 *
 * @business-intent
 *   Tracing IDs in both request context and response headers create a
 *   bidirectional link between client-side error reports and server-side
 *   logs, dramatically reducing mean-time-to-diagnose for fan-facing issues
 *   during live events where rapid support resolution is essential.
 */
export function requestIdMiddleware(req, res, next) {
  // #What — Assign a fresh CSPRNG ID to this request; `req.id` is referenced
  //         throughout the request lifecycle (error handler, logger calls).
  req.id = generateRequestId();

  // #What — Reflect the ID in the response header so the client can log it
  //         for support tickets without needing server-side log access.
  res.setHeader('X-Request-ID', req.id);

  next();
}

/**
 * Enforce a 30-second server-side timeout on all requests.
 *
 * @description
 *   Starts a `setTimeout` timer when the middleware is invoked. If the
 *   response has not been sent (headers not yet sent) within 30 seconds,
 *   sends a 503 Service Unavailable JSON response with the request ID and
 *   clears the timer. The timer is also cleared on the `finish` and `close`
 *   response events to avoid spurious 503s for normally completing requests.
 *
 * @param {import('express').Request} req - The incoming Express request object.
 * @param {import('express').Response} res - The outgoing Express response object.
 * @param {Function} next - The next middleware function in the stack.
 * @returns {void}
 *
 * @risk-area
 *   If a route handler sends the response but the `finish` event is delayed
 *   (e.g. a large streaming body), the timeout may fire between header send
 *   and body completion. The `if (!res.headersSent)` guard prevents a double
 *   response but the connection may still be prematurely terminated.
 *
 * @business-intent
 *   AI tool-calling chains can take several seconds; without a server-side
 *   ceiling, slow Gemini responses during peak stadium load could exhaust the
 *   Node.js connection pool, making the entire service unresponsive. A 30-second
 *   limit ensures connections are always recycled within a bounded time.
 */
export function requestTimeout(req, res, next) {
  // #What — Start the countdown timer; the callback fires if neither the route
  //         handler nor a prior middleware sends a response within 30 seconds.
  // #Uncertain — 30 seconds is a global default; AI endpoints with maxToolRounds=3
  //   may legitimately need more time. Consider per-route timeout overrides.
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      // #What — 503 signals a temporary unavailability; clients should retry
      //         after a short back-off rather than treating it as a permanent error.
      // #Risk-Area — At this point the route handler is still running in the
      //   background; ensure handlers check `res.headersSent` before writing to
      //   res after an async operation to avoid "Cannot set headers after sent" errors.
      res.status(503).json({
        success: false,
        error: { code: 'REQUEST_TIMEOUT', message: 'Request timed out. Please try again.' },
        requestId: req.id,
      });
    }
  }, 30000);

  // #What — Clear the timeout as soon as the response completes successfully,
  //         preventing the 503 from firing after a normal response is already sent.
  res.on('finish', () => clearTimeout(timeout));

  // #What — Also clear on `close` to handle client-disconnected aborts; without
  //         this, the timer would still fire 30 s after the client left.
  res.on('close', () => clearTimeout(timeout));

  next();
}
