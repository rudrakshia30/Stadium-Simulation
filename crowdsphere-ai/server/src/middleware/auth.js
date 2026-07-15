/**
 * @module middleware/auth
 * @description JWT authentication middleware for CrowdSphere AI's operations
 *   command centre. Verifies a JSON Web Token that was issued by the ops login
 *   endpoint, either from an HttpOnly cookie (`ops_token`) or — as a fallback
 *   — from a `Bearer` token in the `Authorization` HTTP header.
 *
 *   On successful verification, the decoded JWT payload is normalised and
 *   attached to `req.user` so downstream route handlers can perform
 *   role-based access control without re-parsing the token.
 *
 *   On any failure (missing token, expired token, invalid signature, wrong
 *   secret), an `AuthError` is forwarded to the global error handler, which
 *   returns a 401 JSON response. No partial state is written to `req`.
 *
 * @pr-changes
 *   - Added Bearer token fallback in `Authorization` header to support API
 *     clients (e.g. Postman, CI scripts) that cannot set cookies.
 *   - Introduced differentiated error messages for expired vs. invalid tokens
 *     to give ops staff clear feedback when their session has lapsed.
 *   - `req.user` now only carries `{ role }` (not the full decoded payload) to
 *     prevent accidental use of unvalidated JWT claims in route handlers.
 *
 * @validation-review
 *   - `jwt.verify` validates signature, expiry (`exp`), and not-before (`nbf`)
 *     claims; it does NOT validate `iss` or `aud` claims unless options are
 *     passed. Consider adding `{ issuer: 'crowdsphere-ai' }` option to prevent
 *     JWT confusion attacks from other services sharing the same secret.
 *   - The cookie name `ops_token` is hardcoded; if it ever changes in the login
 *     route it must be changed here too — extract to a shared constant.
 *   - `decoded.role || 'operations'` defaults to `'operations'` if the role
 *     claim is missing; verify that the login endpoint always populates `role`
 *     and that this default is intentional and safe.
 *   - `req.cookies?.ops_token` requires `cookie-parser` middleware to be
 *     mounted before `requireAuth` in the Express pipeline; verify order in app.js.
 *   - The Bearer token path (`Authorization` header) allows tokens to travel
 *     over HTTPS in a header, which is visible in access logs; prefer the
 *     cookie path in browser clients where possible.
 *
 * @scope-of-improvement
 *   - Add `{ algorithms: ['HS256'] }` to `jwt.verify` options to explicitly
 *     reject tokens signed with asymmetric algorithms, preventing the `alg:none`
 *     attack and algorithm confusion attacks.
 *   - Add JWT `iss` (issuer) and `aud` (audience) claim validation to harden
 *     against cross-service token reuse.
 *   - Implement token revocation via a short-lived blocklist (Redis SET with TTL)
 *     so compromised ops tokens can be immediately invalidated without waiting
 *     for the 15-minute expiry.
 *   - Extract the cookie name `'ops_token'` into a shared config constant to
 *     keep the login and auth middleware in sync automatically.
 *   - Consider logging the `req.id` (request trace ID) alongside auth failures
 *     for security auditing and anomaly detection.
 *
 * @business-intent
 *   Operations staff access controls are the primary safety gate for crowd-
 *   management commands (section closures, emergency alerts, evacuation routing).
 *   A robust auth middleware ensures only authenticated, credentialed staff can
 *   issue these commands, and that stale tokens from staff who have left an
 *   event automatically expire within 15 minutes — minimising the blast radius
 *   of a compromised device or session.
 */

import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { AuthError } from '../utils/errors.js';

/**
 * Express middleware that enforces JWT authentication for protected routes.
 *
 * @description
 *   Attempts to extract a JWT from the `ops_token` HttpOnly cookie first.
 *   If absent, falls back to a `Bearer <token>` value in the `Authorization`
 *   header. If no token is found by either path, an `AuthError` is forwarded
 *   immediately. If a token is found but fails `jwt.verify` (wrong secret,
 *   expired, malformed), an appropriate `AuthError` is forwarded. On success,
 *   attaches `req.user = { role }` and calls `next()`.
 *
 * @param {import('express').Request} req - The incoming Express request object.
 *   Must have `req.cookies` populated by `cookie-parser` middleware.
 * @param {import('express').Response} res - The outgoing Express response object
 *   (not directly used, but required by Express middleware signature).
 * @param {Function} next - The next middleware or error handler in the chain.
 * @returns {void}
 *
 * @risk-area
 *   This middleware is the only server-side enforcement of ops authentication.
 *   Any regression here (e.g. accidentally calling `next()` before verifying
 *   the token) would expose all ops routes to unauthenticated access. This
 *   function must have 100% branch coverage in tests.
 *
 * @business-intent
 *   Crowd-management commands exposed under /api/ops directly affect physical
 *   safety in a live stadium environment. This middleware is the single,
 *   auditable checkpoint that prevents unauthenticated actors from issuing
 *   those commands — it must never be bypassed or short-circuited.
 *
 * @validation-note
 *   The function explicitly does NOT trust any field in `req.cookies` or
 *   `req.headers.authorization` beyond extracting the raw token string;
 *   all trust decisions are made by `jwt.verify` using the server-controlled
 *   `config.jwtSecret`.
 */
export function requireAuth(req, res, next) {
  // #What — Prefer the HttpOnly cookie over the Authorization header because
  //         cookies are not accessible to JavaScript, making them harder to
  //         exfiltrate via XSS than a token stored in localStorage or memory.
  let token = req.cookies?.ops_token;

  // #What — Fallback to Authorization header for non-browser API clients
  //         (automated tools, mobile apps) that cannot set HttpOnly cookies.
  // #Uncertain — The split(' ')[1] extraction does not validate that the token
  //   string is well-formed before passing it to jwt.verify; jwt.verify handles
  //   malformed strings gracefully but consider adding a length sanity check.
  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  // #What — If neither cookie nor header contains a token, forward an AuthError;
  //         do NOT call next() without a verified user or routes become open.
  // #Risk-Area — This early return is the fallback for completely unauthenticated
  //   requests; ensure no route adds requireAuth but then handles AuthError by
  //   proceeding anyway.
  if (!token) {
    return next(new AuthError('Operations access token required'));
  }

  try {
    // #What — Verify the JWT signature against the server-side secret and
    //         automatically reject tokens that are expired (`exp` claim).
    // #Risk-Area — `jwt.verify` with no `algorithms` option accepts any algorithm
    //   the token header declares. Add `{ algorithms: ['HS256'] }` to prevent
    //   the `alg:none` attack and RS256/HS256 confusion.
    // @human-approval-required — Security engineers must review any change to
    //   jwt.verify options or the jwtSecret derivation before deployment.
    const decoded = jwt.verify(token, config.jwtSecret);

    // #What — Attach only the normalised role to req.user, not the full decoded
    //         payload, to prevent route handlers from accidentally trusting
    //         unvalidated custom claims.
    // #Business-Intent — Scoping req.user to just `{ role }` enforces a clean
    //   contract between the auth layer and route handlers; if additional claims
    //   are needed (e.g. staffId), they should be explicitly added here with
    //   validation, not accessed directly from `decoded`.
    req.user = { role: decoded.role || 'operations' };
    next();
  } catch (err) {
    // #What — Distinguish between an expired token and a structurally invalid
    //         one so the ops dashboard can show an appropriate prompt
    //         ("session expired, please re-login" vs. "invalid credentials").
    if (err.name === 'TokenExpiredError') {
      return next(new AuthError('Session expired. Please log in again.'));
    }
    // #Risk-Area — All other JWT errors (invalid signature, malformed, wrong
    //   algorithm) are collapsed into a generic "Invalid access token" message
    //   to avoid leaking information about the failure mode to an attacker.
    return next(new AuthError('Invalid access token'));
  }
}
