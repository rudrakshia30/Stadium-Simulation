/**
 * @module app
 * @description Express application factory for CrowdSphere AI.
 *   Wires together all middleware layers (security headers, CORS, request ID,
 *   timeout, body parsing, rate limiting) and mounts the four domain route
 *   trees (health, venue, fan, ops). Also registers a catch-all 404 handler
 *   and the global error handler as the final middleware layers.
 *   This module exports a pre-configured `app` instance that `server.js`
 *   binds to a port — keeping app construction separate from port binding
 *   makes the app straightforwardly testable with `supertest`.
 *
 * @pr-changes
 *   - Introduced `requestIdMiddleware` and `requestTimeout` from the security
 *     module to every request pipeline.
 *   - Added `cookieParser` to support HttpOnly JWT cookie reads in the auth
 *     middleware.
 *   - Body size capped at `10kb` for both JSON and URL-encoded payloads to
 *     mitigate large-payload DoS vectors.
 *   - Route tree reorganised: /api/health, /api/venue, /api/fan, /api/ops.
 *
 * @validation-review
 *   - The 10 kb body limit must be revisited if the fan AI chat endpoint
 *     ever accepts base64-encoded media attachments.
 *   - CORS is handled by a manual middleware (not the `cors` npm package);
 *     ensure the allowlist logic in `applyCors()` is audited when new client
 *     origins (e.g. mobile apps) are introduced.
 *   - The 404 handler must remain the last `app.use` call before `errorHandler`
 *     to avoid shadowing legitimate routes added in future.
 *   - `cookieParser` is invoked without a secret; signed-cookie functionality
 *     is therefore unavailable — verify this is intentional.
 *
 * @scope-of-improvement
 *   - Add a request-logging middleware (e.g. Morgan or a custom structured
 *     logger) so every HTTP access is captured with method, path, status, and
 *     latency for observability.
 *   - Consider splitting the 404 handler into a dedicated module to keep
 *     `app.js` focused purely on middleware composition.
 *   - Add API versioning prefix (e.g. `/api/v1/`) to future-proof the route
 *     namespace before the public launch.
 *   - Evaluate replacing the manual CORS middleware with the `cors` npm
 *     package for multi-origin support and preflight caching headers.
 *
 * @business-intent
 *   Centralising all middleware composition in one file gives the operations
 *   team a single place to audit what security and behavioural policies apply
 *   to every API request. Separating app setup from server boot allows
 *   integration tests to spin up the full middleware stack without binding a
 *   real OS port, enabling fast CI pipelines on match-day release days.
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import {
  applyHelmet,
  applyCors,
  generalRateLimit,
  requestIdMiddleware,
  requestTimeout,
} from './middleware/security.js';
import { errorHandler } from './middleware/errorHandler.js';
import healthRoutes from './routes/health.js';
import venueRoutes from './routes/venue.js';
import fanRoutes from './routes/fan.js';
import opsRoutes from './routes/ops.js';

// #What — Create the Express application instance; all configuration is applied
//         via `app.use()` below rather than in the constructor.
const app = express();

// ─── Security middleware ───────────────────────────────────────────────────
// #What — Apply Helmet HTTP security headers (CSP, X-Frame-Options, etc.)
//         as the very first middleware so they are always present regardless
//         of which route is hit.
// #Risk-Area — Helmet defaults are permissive for fonts and images; review the
//   CSP directive set in applyHelmet() whenever third-party embeds are added.
app.use(applyHelmet());

// #What — Apply the manual CORS middleware that restricts responses to the
//         single allowed client origin (configured via CLIENT_ORIGIN env var).
// #Risk-Area — Only a single origin is whitelisted; adding a second frontend
//   (e.g. admin portal) requires updating applyCors() or the config.
app.use(applyCors());

// #What — Attach a cryptographically random request ID to every request and
//         reflect it in the X-Request-ID response header for traceability.
app.use(requestIdMiddleware);

// #What — Start a 30-second server-side timeout timer for every request so
//         slow AI responses don't hold connections open indefinitely.
// #Business-Intent — Bounded request duration protects server resources during
//   high-traffic stadium events where the crowd-query queue may surge.
app.use(requestTimeout);

// ─── Body parsing ──────────────────────────────────────────────────────────
// #What — Parse JSON request bodies, enforcing a 10 kb hard limit to prevent
//         memory-exhaustion attacks via oversized payloads.
// #Risk-Area — 10 kb may be insufficient if conversation history is included
//   in request bodies; validate against the maxConversationLength config value.
app.use(express.json({ limit: '10kb' }));

// #What — Parse URL-encoded form bodies (non-nested), also capped at 10 kb.
app.use(express.urlencoded({ extended: false, limit: '10kb' }));

// #What — Parse cookies so downstream auth middleware can read the HttpOnly
//         ops_token JWT cookie set by the login route.
app.use(cookieParser());

// ─── General rate limiting ─────────────────────────────────────────────────
// #What — Apply the general API rate limiter to all /api/* routes; stricter
//         per-endpoint limits are layered on top of this at the route level.
// #Business-Intent — Prevents automated scraping of venue data and protects
//   Gemini API quota during high-footfall match days.
app.use('/api/', generalRateLimit());

// ─── Routes ───────────────────────────────────────────────────────────────
// #What — Mount the health-check route tree (unauthenticated, lightweight).
app.use('/api/health', healthRoutes);

// #What — Mount venue data routes (seat maps, amenity info, crowd density).
app.use('/api/venue', venueRoutes);

// #What — Mount fan AI chat routes (Gemini-powered query answering for fans).
// #Business-Intent — The /api/fan namespace is the primary revenue-generating
//   surface: it powers the in-stadium AI assistant used by ticketed fans.
app.use('/api/fan', fanRoutes);

// #What — Mount operations command-centre routes (JWT-protected; ops staff only).
// #Risk-Area — /api/ops routes are sensitive; they expose crowd-management
//   controls and must remain behind requireAuth middleware in the route file.
app.use('/api/ops', opsRoutes);

// ─── 404 handler ──────────────────────────────────────────────────────────
// #What — Catch any request that did not match a registered route and return
//         a structured 404 JSON response consistent with the rest of the API.
// #Uncertain — If a route is accidentally mounted after this handler, it will
//   never be reachable; always add new routes BEFORE this block.
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Endpoint not found' },
  });
});

// ─── Global error handler ─────────────────────────────────────────────────
// #What — Must be registered last and must accept exactly 4 arguments so
//         Express recognises it as an error-handling middleware.
app.use(errorHandler);

export default app;
