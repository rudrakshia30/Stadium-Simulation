/**
 * @module utils/crypto
 * @description Cryptographic utility functions for CrowdSphere AI server.
 *   Provides a constant-time string comparison to prevent timing-oracle attacks
 *   when verifying secrets (e.g. OPS_ACCESS_CODE), and a cryptographically
 *   secure random hex ID generator used for request tracing.
 *
 *   Both functions delegate to Node.js's built-in `crypto` module to avoid
 *   the pitfalls of userland implementations (e.g. non-constant-time string
 *   comparison via `===`, weak PRNGs via `Math.random`).
 *
 * @pr-changes
 *   - Replaced a naive `===` comparison with `crypto.timingSafeEqual` to
 *     prevent timing-based side-channel attacks on the ops access code check.
 *   - Added a dummy `nativeTimingSafeEqual(bufA, bufA)` call for the
 *     length-mismatch path to avoid measurable branching on length alone.
 *   - Added `generateRequestId()` alongside the comparison helper so both
 *     crypto primitives live in the same auditable module.
 *
 * @validation-review
 *   - Length difference IS leaked via the early-return path even with the
 *     dummy comparison; this is an accepted limitation because a length
 *     mismatch guarantees inequality regardless of the values — documented
 *     in the function JSDoc for future auditors.
 *   - `Buffer.from(a, 'utf8')` correctly handles multi-byte Unicode characters;
 *     confirm that caller strings (e.g. access codes) are always UTF-8.
 *   - `randomBytes(8).toString('hex')` produces 16 hex characters (64 bits of
 *     entropy); adequate for request ID uniqueness in a single process but NOT
 *     suitable for use as a cryptographic nonce or session token.
 *   - If either argument `a` or `b` is not a string, the function returns
 *     `false` immediately — callers must ensure type coercion does not silently
 *     convert a value to a string before calling this function.
 *
 * @scope-of-improvement
 *   - Accept `Buffer` arguments directly in addition to strings to avoid
 *     unnecessary re-encoding when the caller already holds binary data.
 *   - Add an explicit minimum-length check: reject empty strings (`''`) early
 *     to prevent trivially false-positive matches on two empty buffers.
 *   - Increase `generateRequestId` to 16 bytes (32 hex chars) if request IDs
 *     are ever persisted for audit trails, increasing collision resistance.
 *   - Consider exporting a `hashAccessCode(code)` function (PBKDF2/argon2) for
 *     future scenarios where the ops access code is stored rather than compared
 *     against an in-memory constant.
 *
 * @business-intent
 *   The operations command centre access code is a shared secret used by all
 *   venue operations staff to obtain JWT tokens. A timing side-channel on this
 *   check would allow an adversary to guess the code character-by-character,
 *   potentially gaining access to crowd-management controls during a live event
 *   — a safety-critical breach. Using `timingSafeEqual` eliminates this vector.
 */

import { timingSafeEqual as nativeTimingSafeEqual, randomBytes } from 'crypto';

/**
 * Compare two strings in constant time to prevent timing-oracle attacks.
 *
 * @description
 *   Converts both strings to UTF-8 `Buffer` objects and delegates to Node.js's
 *   native `crypto.timingSafeEqual`, which always takes the same wall-clock
 *   time regardless of where (or whether) the bytes differ.
 *
 *   If the buffer lengths differ, a dummy self-comparison is performed on `bufA`
 *   before returning `false`. This prevents a measurable branch on length alone,
 *   though the length difference itself is still observable — an accepted
 *   trade-off because different-length strings cannot be equal.
 *
 * @param {string} a - First string to compare (e.g. the submitted access code).
 * @param {string} b - Second string to compare (e.g. the known correct code).
 * @returns {boolean} `true` only if both strings are identical.
 *
 * @risk-area
 *   This function guards the ops login endpoint. Any change to this comparison
 *   logic (e.g. converting to `===`) would re-introduce a timing oracle and
 *   must be reviewed by a security engineer before merging.
 *
 * @business-intent
 *   Prevents adversarial measurement of server response times from revealing
 *   individual characters of the OPS_ACCESS_CODE, protecting the ops login
 *   endpoint from a timing-based brute-force attack.
 */
export function timingSafeEqual(a, b) {
  // #What — Guard against non-string inputs; `crypto.timingSafeEqual` requires
  //         equal-length Buffer arguments and would throw on undefined/null.
  // #Risk-Area — Returning false for non-strings is safe (prevents bypass) but
  //   callers should log a warning if this branch is hit unexpectedly.
  if (typeof a !== 'string' || typeof b !== 'string') return false;

  // #What — Encode both strings to UTF-8 Buffer to get a byte-level
  //         representation suitable for nativeTimingSafeEqual.
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');

  if (bufA.length !== bufB.length) {
    // #What — Perform a no-op self-comparison on bufA to consume similar CPU
    //         cycles as a real comparison, reducing the timing signal from
    //         a length mismatch.
    // #Uncertain — This dummy comparison may be optimised away by V8's JIT
    //   compiler in future Node.js versions; periodically validate that timing
    //   variance between equal-length and unequal-length inputs remains minimal.
    // @human-approval-required — Security engineers should periodically benchmark
    //   this branch to confirm constant-time behaviour is maintained post Node.js upgrades.
    nativeTimingSafeEqual(bufA, bufA);
    return false;
  }

  // #What — Delegate to Node.js native implementation; result is `true` only if
  //         every byte of both buffers is identical.
  return nativeTimingSafeEqual(bufA, bufB);
}

/**
 * Generate a cryptographically secure random hex request identifier.
 *
 * @description
 *   Uses `crypto.randomBytes` (CSPRNG) to produce 8 random bytes, then
 *   encodes them as a 16-character lowercase hexadecimal string. The result
 *   is suitable for request tracing in logs and the `X-Request-ID` response
 *   header.
 *
 * @returns {string} 16-character lowercase hex string, e.g. `"a3f2c1b4e5d6f7e8"`.
 *
 * @business-intent
 *   Each request carries a unique, unguessable ID that allows ops engineers
 *   to correlate log entries across multiple microservices (if introduced) and
 *   trace fan query failures to their root cause without exposing user-
 *   identifiable information.
 */
export function generateRequestId() {
  // #What — randomBytes(8) gives 64 bits of CSPRNG entropy; hex-encoding
  //         doubles the character count to 16 printable ASCII chars.
  // #Business-Intent — Using `crypto.randomBytes` instead of `Math.random`
  //   ensures IDs cannot be predicted or replayed by an adversary monitoring
  //   the X-Request-ID response header.
  return randomBytes(8).toString('hex');
}
