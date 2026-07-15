/**
 * @module utils/requestId
 * @description Request ID generator utility for CrowdSphere AI server.
 *   Produces short, cryptographically secure, unique hexadecimal identifiers
 *   that are attached to every incoming HTTP request for end-to-end tracing
 *   across logs, error responses, and the `X-Request-ID` response header.
 *
 *   This module is intentionally minimal: it wraps Node.js's `crypto.randomBytes`
 *   CSPRNG in a named export so the generation strategy can be changed in one
 *   place without updating every call site, and so it can be mocked cleanly
 *   in unit tests.
 *
 * @pr-changes
 *   - Extracted request ID generation from the security middleware into this
 *     dedicated utility module to keep the middleware file focused on HTTP
 *     pipeline concerns and make the ID format easy to change centrally.
 *   - Uses `crypto.randomBytes` (CSPRNG) instead of `uuid` or `Math.random`
 *     to avoid adding a third-party dependency for a simple primitive.
 *
 * @validation-review
 *   - `randomBytes(8)` produces 64 bits of entropy — statistically sufficient
 *     to avoid collisions in a single-process server handling millions of
 *     requests, but NOT suitable for distributed systems without a
 *     node-identifier prefix (e.g. Snowflake IDs).
 *   - The hex output is always exactly 16 characters; any consumer that
 *     truncates or pads the ID may cause tracing mismatches.
 *   - `crypto.randomBytes` is synchronous in this usage; in environments with
 *     limited OS entropy (e.g. cold-start containers), it may block briefly
 *     until the entropy pool is seeded. Monitor for this on first boot.
 *
 * @scope-of-improvement
 *   - Increase entropy to `randomBytes(16)` (32 hex chars) if request IDs are
 *     persisted in an audit log or shared across distributed services where
 *     collision avoidance requirements are stricter.
 *   - Add a configurable prefix (e.g. `cs-` + hex) to make CrowdSphere request
 *     IDs identifiable in multi-service log streams.
 *   - Consider adopting the W3C Trace Context `traceparent` format
 *     (https://www.w3.org/TR/trace-context/) for compatibility with OpenTelemetry
 *     if distributed tracing is introduced.
 *
 * @business-intent
 *   Unique, unguessable request IDs enable the operations team to correlate
 *   fan query failures, security alerts, and AI service errors across log
 *   streams during high-pressure match-day incidents. The ID is surfaced in
 *   API error responses so support staff can look up the exact server-side
 *   trace without asking users for personally identifiable information.
 */

import { randomBytes } from 'crypto';

/**
 * Generate a unique 16-character cryptographically secure hex request ID.
 *
 * @description
 *   Calls `crypto.randomBytes(8)` to obtain 8 bytes of random data from the
 *   operating system's CSPRNG, then encodes them as a 16-character lowercase
 *   hexadecimal string. The result is unique per call with negligible collision
 *   probability across the lifetime of a single server process.
 *
 * @returns {string} A 16-character lowercase hex string, e.g. `"a3f2c1b4e5d6f7e8"`.
 *
 * @business-intent
 *   The generated ID is attached to every HTTP request as `req.id`, included
 *   in the `X-Request-ID` response header, and embedded in all log entries
 *   and error responses for that request. This allows a fan or ops agent to
 *   report an ID from an error message and have it instantly located in logs
 *   — speeding up incident resolution during live events.
 */
export function generateRequestId() {
  // #What — randomBytes(8) synchronously reads 8 bytes from the OS entropy
  //         pool (CSPRNG), providing 64 bits of randomness per ID.
  // #Business-Intent — Using a CSPRNG rather than `Math.random` ensures IDs
  //   cannot be predicted from a sequence of previously observed IDs, preventing
  //   an adversary from forging a request ID to poison log traces.
  return randomBytes(8).toString('hex');
}
