/**
 * Structured logger for CrowdSphere AI server.
 * Outputs JSON log entries to stdout/stderr.
 * Automatically redacts secrets from log metadata.
 *
 * @module utils/logger
 */

/** Keys whose values should be redacted in logs */
const SENSITIVE_KEYS = new Set(['key', 'secret', 'password', 'token', 'authorization', 'apikey', 'api_key', 'geminikey']);

/**
 * Recursively redact sensitive values from an object.
 * @param {unknown} obj
 * @returns {unknown}
 */
function redact(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(redact);

  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    const lk = k.toLowerCase().replace(/[-_]/g, '');
    if (SENSITIVE_KEYS.has(lk)) {
      result[k] = '[REDACTED]';
    } else {
      result[k] = redact(v);
    }
  }
  return result;
}

/**
 * Write a structured log entry.
 * @param {'info'|'warn'|'error'|'debug'} level
 * @param {string} message
 * @param {Record<string, unknown>} [meta]
 */
function log(level, message, meta = {}) {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...redact(meta),
  };

  const output = JSON.stringify(entry);
  if (level === 'error') {
    process.stderr.write(output + '\n');
  } else {
    process.stdout.write(output + '\n');
  }
}

export const logger = {
  /** @param {string} message @param {Record<string,unknown>} [meta] */
  info: (message, meta) => log('info', message, meta),

  /** @param {string} message @param {Record<string,unknown>} [meta] */
  warn: (message, meta) => log('warn', message, meta),

  /** @param {string} message @param {Record<string,unknown>} [meta] */
  error: (message, meta) => log('error', message, meta),

  /** @param {string} message @param {Record<string,unknown>} [meta] */
  debug: (message, meta) => {
    if (process.env.NODE_ENV !== 'production') log('debug', message, meta);
  },
};
