/**
 * @module utils/logger
 * @description Structured JSON logger for the CrowdSphere AI server.
 *   Writes newline-delimited JSON log entries to stdout (info/warn/debug) and
 *   stderr (error) for compatibility with log aggregation systems such as
 *   Google Cloud Logging, Datadog, and ELK. All log entries include a UTC
 *   ISO-8601 timestamp, a severity level, a human-readable message, and an
 *   optional metadata object.
 *
 *   A built-in redaction layer strips values whose key names match a denylist
 *   of sensitive terms (password, token, secret, API key, etc.) before any
 *   metadata is serialised and emitted. This prevents credential leakage into
 *   log storage systems which may have broader access than the application
 *   runtime itself.
 *
 * @pr-changes
 *   - Added automatic recursive redaction of sensitive metadata keys via the
 *     `SENSITIVE_KEYS` denylist and the `redact()` helper.
 *   - `debug` level is suppressed in `production` environments to reduce log
 *     volume and avoid leaking internal state to log pipelines.
 *   - Switched from `console.log` to `process.stdout/stderr.write` to produce
 *     synchronous, line-buffered output without the formatting overhead of
 *     the `console` API.
 *
 * @validation-review
 *   - The `SENSITIVE_KEYS` denylist normalises keys by lower-casing and
 *     stripping hyphens/underscores before matching; verify new key naming
 *     conventions are covered (e.g. camelCase like `jwtSecret`).
 *   - `redact()` only iterates own enumerable properties via `Object.entries`;
 *     non-enumerable or prototype-chain properties in meta objects are not
 *     redacted — avoid logging objects with sensitive non-enumerable fields.
 *   - `JSON.stringify(entry)` may throw if `meta` contains circular references
 *     or BigInt values; controllers should not log raw request/response objects.
 *   - The `debug` level guard checks `process.env.NODE_ENV` at call time, not
 *     at module load time; toggling NODE_ENV at runtime has no effect.
 *
 * @scope-of-improvement
 *   - Add a `requestId` field automatically extracted from an AsyncLocalStorage
 *     context so every log line within a request is correlated without manual
 *     meta passing.
 *   - Replace the raw `JSON.stringify` with a try/catch that falls back to
 *     `util.inspect` for circular or non-serialisable objects.
 *   - Support configurable log levels (e.g. suppress `warn` in test) via an
 *     environment variable `LOG_LEVEL=error`.
 *   - Add a `child(meta)` method that pre-populates fixed metadata fields
 *     (service name, version, pod ID) into every log entry from a logger
 *     instance, avoiding repetition in each `logger.info()` call.
 *
 * @business-intent
 *   Structured JSON logs are essential for the stadium operations team to
 *   trace fan query failures, security incidents, and AI service degradations
 *   during live events. The redaction layer protects user data and API
 *   credentials from appearing in log exports shared with third-party
 *   monitoring vendors, satisfying data-minimisation requirements.
 */

/**
 * Denylist of normalised key names whose values must always be redacted.
 * Keys are compared after lower-casing and removing hyphens and underscores
 * so that `api-key`, `apiKey`, `API_KEY` etc. all match `apikey`.
 *
 * @type {Set<string>}
 * @risk-area Extend this set whenever new secret fields are introduced to the
 *   application (e.g. webhook signing secrets, OAuth client credentials).
 */
const SENSITIVE_KEYS = new Set(['key', 'secret', 'password', 'token', 'authorization', 'apikey', 'api_key', 'geminikey']);

/**
 * Recursively redact sensitive values from a log metadata object.
 *
 * @description
 *   Walks the object graph depth-first. When a key (normalised) matches an
 *   entry in `SENSITIVE_KEYS`, its value is replaced with the literal string
 *   `'[REDACTED]'`. Arrays are mapped element-by-element. Primitive values
 *   are returned unchanged.
 *
 * @param {unknown} obj - Any value that may appear in log metadata.
 * @returns {unknown} A new object/array/primitive with sensitive values replaced.
 *
 * @risk-area
 *   If a sensitive value is nested inside a key that is NOT in the denylist
 *   (e.g. `{ credentials: { apikey: 'abc' } }`), only the inner `apikey` key
 *   is caught. The outer `credentials` wrapper key is not in the denylist and
 *   will not cause the entire object to be redacted — only the leaf.
 *
 * @business-intent
 *   Prevents API keys, JWT secrets, and passwords from appearing in log
 *   aggregation systems used by SRE and vendor monitoring teams, satisfying
 *   least-privilege and data-minimisation principles.
 */
function redact(obj) {
  // #What — Base case: primitives (strings, numbers, booleans, null) are
  //         not objects and cannot contain sensitive sub-keys; return as-is.
  if (typeof obj !== 'object' || obj === null) return obj;

  // #What — Arrays are recursively mapped so nested objects inside arrays
  //         are also redacted (e.g. conversation history arrays).
  if (Array.isArray(obj)) return obj.map(redact);

  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    // #What — Normalise the key: lower-case + strip hyphens/underscores to
    //         catch all common naming conventions in a single denylist check.
    const lk = k.toLowerCase().replace(/[-_]/g, '');

    if (SENSITIVE_KEYS.has(lk)) {
      // #Risk-Area — Replace the value entirely; do NOT include a partial value
      //   or length hint as that could aid secret-guessing attacks.
      result[k] = '[REDACTED]';
    } else {
      // #What — Recurse into non-sensitive values to catch nested sensitive keys.
      result[k] = redact(v);
    }
  }
  return result;
}

/**
 * Serialise and emit a structured log entry to the appropriate output stream.
 *
 * @description
 *   Constructs a JSON log entry containing `level`, `message`, `timestamp`,
 *   and all (redacted) metadata fields spread at the top level. Errors are
 *   written to `process.stderr`; all other levels go to `process.stdout`.
 *   Uses synchronous stream writes to ensure log ordering under high concurrency.
 *
 * @param {'info'|'warn'|'error'|'debug'} level - Log severity level.
 * @param {string} message - Human-readable log message.
 * @param {Record<string, unknown>} [meta={}] - Optional structured metadata (will be redacted).
 * @returns {void}
 *
 * @risk-area
 *   `JSON.stringify` will throw on circular references. Callers must not pass
 *   raw Express `req`/`res` objects or Error instances with circular refs as
 *   metadata values — extract only the needed primitive fields instead.
 *
 * @business-intent
 *   A single, consistent log format across all severity levels makes log
 *   parsing and alerting rules in monitoring systems (Datadog, Stackdriver)
 *   straightforward to maintain without per-level format special-casing.
 */
function log(level, message, meta = {}) {
  // #What — Compose the log entry object; metadata is spread at top level so
  //         log query tools can filter directly on field names (e.g. requestId).
  const entry = {
    level,
    message,
    // #What — ISO-8601 UTC timestamp added at serialisation time to reflect
    //         when the log was actually written, not when the logger was created.
    timestamp: new Date().toISOString(),
    // #What — Spread redacted metadata directly into the entry rather than
    //         nesting it under a `meta` key to improve log query ergonomics.
    ...redact(meta),
  };

  const output = JSON.stringify(entry);

  // #What — Route error-level logs to stderr so container runtimes and process
  //         managers (PM2, supervisord) can separate error streams from info.
  if (level === 'error') {
    process.stderr.write(output + '\n');
  } else {
    process.stdout.write(output + '\n');
  }
}

/**
 * Public logger interface for CrowdSphere AI server modules.
 *
 * @description
 *   Provides `info`, `warn`, `error`, and `debug` convenience methods that
 *   delegate to the internal `log()` function. `debug` is a no-op in
 *   production to avoid verbose log noise in deployed environments.
 *
 * @type {{ info: Function, warn: Function, error: Function, debug: Function }}
 */
export const logger = {
  /**
   * Log an informational message.
   * @param {string} message - Descriptive message.
   * @param {Record<string, unknown>} [meta] - Optional structured context.
   * @returns {void}
   */
  info: (message, meta) => log('info', message, meta),

  /**
   * Log a warning — something unexpected happened but the request can continue.
   * @param {string} message - Warning description.
   * @param {Record<string, unknown>} [meta] - Optional structured context.
   * @returns {void}
   */
  warn: (message, meta) => log('warn', message, meta),

  /**
   * Log an error — write to stderr and include as much context as is safe.
   * @param {string} message - Error description.
   * @param {Record<string, unknown>} [meta] - Optional structured context (stack, requestId, etc.).
   * @returns {void}
   * @risk-area Ensure stack traces are NOT included in meta when isProduction
   *   is true; the errorHandler already enforces this for caught errors.
   */
  error: (message, meta) => log('error', message, meta),

  /**
   * Log a debug-level message — suppressed entirely in production.
   * @param {string} message - Detailed internal trace message.
   * @param {Record<string, unknown>} [meta] - Optional structured context.
   * @returns {void}
   * @business-intent Debug logs contain verbose AI call details useful in
   *   development/staging; suppressing them in production prevents information
   *   disclosure and reduces log storage costs.
   */
  debug: (message, meta) => {
    // #What — Guard against writing debug noise to production log streams;
    //         check NODE_ENV at call time so the guard cannot be cached-away.
    // #Business-Intent — Debug entries may include raw AI prompts and partial
    //   responses; keeping them out of production logs limits exposure.
    if (process.env.NODE_ENV !== 'production') log('debug', message, meta);
  },
};
