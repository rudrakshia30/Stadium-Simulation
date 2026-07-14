/**
 * Constant-time string comparison to prevent timing attacks.
 * Uses Node.js native crypto.timingSafeEqual.
 *
 * @module utils/crypto
 */

import { timingSafeEqual as nativeTimingSafeEqual, randomBytes } from 'crypto';

/**
 * Compare two strings in constant time.
 * Returns false immediately if lengths differ (length itself may leak,
 * but mismatched lengths cannot match regardless).
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;

  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');

  if (bufA.length !== bufB.length) {
    // Still do a dummy comparison to avoid branching on length alone
    nativeTimingSafeEqual(bufA, bufA);
    return false;
  }

  return nativeTimingSafeEqual(bufA, bufB);
}

/**
 * Generate a random hex request ID.
 * @returns {string}
 */
export function generateRequestId() {
  return randomBytes(8).toString('hex');
}
