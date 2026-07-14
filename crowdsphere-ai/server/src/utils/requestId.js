/**
 * @fileoverview Request ID generator.
 * Produces short, unique hex identifiers for request tracing.
 * @module utils/requestId
 */

import { randomBytes } from 'crypto';

/**
 * Generate a unique 16-character hex request ID.
 * @returns {string} Hex-encoded random bytes, e.g. "a3f2c1b4e5d6f7e8"
 */
export function generateRequestId() {
  return randomBytes(8).toString('hex');
}
