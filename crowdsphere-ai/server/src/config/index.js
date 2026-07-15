/**
 * @module config
 * @description Centralised runtime configuration for the CrowdSphere AI server.
 *   All environment variables are consumed exclusively in this module; no other
 *   file may read `process.env` directly. Values are parsed, defaulted, and
 *   validated once at startup so the rest of the application can rely on typed,
 *   trustworthy config values without defensive null-checks scattered throughout.
 *
 * @pr-changes
 *   - Added production-guard that throws at startup if JWT_SECRET or
 *     OPS_ACCESS_CODE are missing in a production environment.
 *   - Introduced `maxMessageLength`, `maxConversationLength`, and `maxToolRounds`
 *     to centralise AI interaction limits previously hardcoded in controllers.
 *   - Split rate-limit config into `rateLimit` (general) and `loginRateLimit`
 *     (strict) objects to allow independent tuning.
 *   - Added `cacheMaxSize` and `cacheTtlMs` for the in-memory route-data cache.
 *
 * @validation-review
 *   - JWT_SECRET must be at least 32 characters for HS256 to be cryptographically
 *     adequate; the production guard enforces presence but NOT minimum length.
 *     Consider adding a length assertion: `if (secret.length < 32) throw`.
 *   - `parseInt(process.env.PORT || '8080', 10)` does not validate that the
 *     result is a valid port number (1–65535); NaN or out-of-range values will
 *     cause a silent bind failure or an OS error.
 *   - DEV_JWT_SECRET and DEV_OPS_CODE are committed to source; ensure they are
 *     explicitly blocked by production deployment pipelines (CI env check).
 *   - `jwtExpiresIn: '15m'` is hardcoded and cannot be overridden via env;
 *     expose it as an env var if different environments need different TTLs.
 *
 * @scope-of-improvement
 *   - Integrate a schema-validation library (e.g. `zod` or `joi`) to parse and
 *     validate all env vars with descriptive error messages and type coercion.
 *   - Expose `jwtExpiresIn` and the shutdown timeout via env vars for operational
 *     flexibility without code changes.
 *   - Add a `config.validate()` function that runs all assertions and returns a
 *     structured report, making startup validation explicit and testable.
 *   - Consider a secrets-manager integration (AWS Secrets Manager, Vault) to
 *     avoid secrets being present as plain env vars in container definitions.
 *
 * @business-intent
 *   A single source of truth for all runtime config reduces misconfiguration
 *   incidents during stadium-day deployments. The strict production guard for
 *   JWT_SECRET prevents accidentally launching with the well-known dev secret,
 *   which would make all issued tokens trivially forgeable — a critical safety
 *   concern when ops staff tokens gate crowd-management actions.
 */

// #Risk-Area — These dev-only secrets are committed in plaintext.
//   They MUST NOT reach a production environment.
// @human-approval-required — Confirm that CI/CD pipeline rejects builds where
//   JWT_SECRET is not set from a secrets manager in production deployments.
const DEV_JWT_SECRET = 'crowdsphere-dev-jwt-secret-minimum-32-chars-do-not-use-in-production';
const DEV_OPS_CODE = 'crowdsphere-demo-2026';

// #What — Determine runtime environment once so all subsequent checks are
//         consistent and cannot drift from different string comparisons.
const isProduction = process.env.NODE_ENV === 'production';

// #What — Hard-fail at process startup if critical secrets are absent in
//         production; it is safer to refuse to start than to run insecurely.
// #Risk-Area — Missing JWT_SECRET in production means ALL JWT verification would
//   fall back to the dev secret, making ops tokens globally forgeable.
// #Business-Intent — Ops staff access controls gate safety-critical commands
//   (e.g. crowd evacuation prompts); a forged token must never be possible.
if (isProduction) {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required in production');
  if (!process.env.OPS_ACCESS_CODE) throw new Error('OPS_ACCESS_CODE is required in production');
}

export const config = {
  /**
   * TCP port the HTTP server listens on.
   * Defaults to 8080 to align with common container/cloud platform conventions.
   * @type {number}
   */
  // #Uncertain — parseInt without range validation; consider asserting
  //   1 <= port <= 65535 to surface misconfiguration early.
  port: parseInt(process.env.PORT || '8080', 10),

  /**
   * Node.js runtime environment identifier.
   * Governs debug logging, stack trace exposure, and dev-secret fallbacks.
   * @type {string}
   */
  nodeEnv: process.env.NODE_ENV || 'development',

  /**
   * HMAC-SHA256 signing secret for JWT tokens.
   * Falls back to a well-known dev secret when not in production.
   * Must be at minimum 32 characters for HS256 security.
   * @type {string}
   * @risk-area Fallback to DEV_JWT_SECRET in non-production environments is
   *   intentional for local development only. Validate length >= 32 chars.
   */
  jwtSecret: process.env.JWT_SECRET || DEV_JWT_SECRET,

  /**
   * Plaintext access code for the operations command centre login endpoint.
   * Compared using timingSafeEqual to prevent timing-oracle attacks.
   * @type {string}
   * @risk-area Must be treated as a secret; rotate if compromised.
   */
  opsAccessCode: process.env.OPS_ACCESS_CODE || DEV_OPS_CODE,

  /**
   * Google Gemini API key.
   * If absent the application starts in demo/fixture mode — no live AI calls.
   * @type {string}
   */
  geminiApiKey: process.env.GEMINI_API_KEY || '',

  /**
   * Gemini model identifier string used for all AI inference requests.
   * Defaults to `gemini-2.5-flash` for balanced speed and capability.
   * @type {string}
   */
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',

  /**
   * Allowed CORS origin for browser clients.
   * Only this exact origin receives CORS headers; all others are silently blocked.
   * @type {string}
   * @risk-area Single-origin allowlist; must be updated for multi-tenant deploys.
   */
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',

  /**
   * JWT access token lifetime.
   * Short 15-minute window limits the blast radius of a stolen token.
   * @type {string}
   * @business-intent Short-lived tokens reduce the attack window for ops staff
   *   credentials, which control safety-critical venue management features.
   */
  // #Uncertain — Hardcoded value cannot be tuned per environment without a code
  //   change; consider exposing as JWT_EXPIRES_IN env var.
  jwtExpiresIn: '15m',

  /**
   * Maximum allowed character length for a single user message sent to the AI.
   * Prevents runaway prompt injection via excessively long inputs.
   * @type {number}
   * @risk-area Longer messages increase Gemini token consumption and cost; ensure
   *   this limit is enforced server-side in the controller, not just client-side.
   */
  maxMessageLength: 2000,

  /**
   * Maximum number of messages retained per conversation session.
   * Keeps context window within model limits and reduces per-request token costs.
   * @type {number}
   */
  maxConversationLength: 20,

  /**
   * Maximum Gemini tool-calling rounds allowed per single request.
   * Prevents runaway tool-use loops from exhausting quota or causing timeouts.
   * @type {number}
   * @risk-area If a tool result causes the model to always request another tool,
   *   without this cap the call would recurse until the 30 s request timeout.
   */
  maxToolRounds: 3,

  /**
   * Maximum number of entries in the in-memory route/venue data cache.
   * Eviction policy is LRU (least-recently-used) when the limit is reached.
   * @type {number}
   */
  cacheMaxSize: 100,

  /**
   * Time-to-live in milliseconds for cached route/venue data entries.
   * Set to 30 seconds to balance freshness against repeated DB/compute overhead.
   * @type {number}
   * @business-intent Venue layout data rarely changes mid-event; a 30 s cache
   *   dramatically reduces repeated identical lookups during fan query bursts.
   */
  cacheTtlMs: 30_000,

  /**
   * General API rate limiter configuration.
   * Applies to all /api/* routes as a baseline protection layer.
   * @type {{ windowMs: number, max: number }}
   */
  // #Business-Intent — 100 requests per 15-minute window per IP balances generous
  //   fan usage against automated scraping of venue data.
  rateLimit: {
    windowMs: 15 * 60 * 1000, // #What — 15-minute sliding window in milliseconds
    max: 100,
  },

  /**
   * Strict rate limiter configuration for the login endpoint.
   * Much tighter than the general limit to deter credential-stuffing attacks.
   * @type {{ windowMs: number, max: number }}
   * @risk-area 10 attempts per 15 minutes may lock out legitimate ops staff if
   *   they mistype credentials; consider alerting on repeated failures.
   */
  loginRateLimit: {
    windowMs: 15 * 60 * 1000, // #What — 15-minute sliding window in milliseconds
    max: 10, // #Business-Intent — Tight cap protects ops staff login from brute-force
  },

  /**
   * Convenience flag indicating whether the current runtime is production.
   * Used throughout the app to conditionally suppress debug info or enable
   * stricter validation.
   * @type {boolean}
   */
  isProduction,
};
