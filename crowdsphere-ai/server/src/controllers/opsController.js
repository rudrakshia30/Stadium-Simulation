/**
 * @module controllers/opsController
 * @description Operations Command Centre controller for CrowdSphere AI.
 *   Handles the full lifecycle of ops staff interactions:
 *   - Login / logout with JWT issuance and HttpOnly cookie management.
 *   - Real-time snapshot aggregation (crowd metrics, risk score, volunteer status).
 *   - Scenario switching (swaps the live crowd simulation state for demos/training).
 *   - AI brief generation via Gemini with server-side output validation.
 *   - AI-assisted PA announcement drafting with audience/language control.
 *
 *   Every endpoint in this controller is protected by the `requireAuth` middleware
 *   (mounted in the routes layer), with the sole exception of `login`. This means
 *   all state-modifying actions require a valid 15-minute JWT token, and all AI
 *   generation calls are gated behind both auth and server-side validation before
 *   responses are returned to the ops dashboard.
 *
 * @pr-changes
 *   - Introduced `setGeminiClient()` dependency injection so the controller
 *     does not import the client directly, making it easily testable with mocks.
 *   - Added comprehensive `metrics` object to `getSnapshot()` including
 *     `volunteerShortage`, `accessibilityDisruptions`, and `transportDisruptions`
 *     for at-a-glance situational awareness in the ops dashboard.
 *   - Added `generateBrief()` with performance logging (`durationMs`) and
 *     `snapshotVersion` metadata to allow the client to detect stale briefs.
 *   - `createAnnouncement()` now logs audience and language for audit purposes.
 *   - Cookie SameSite attribute is dynamically set to `'none'` in production
 *     (required for cross-origin cookie delivery) and `'strict'` in development.
 *
 * @validation-review
 *   - All request bodies are validated via Zod schemas (`loginSchema`, `scenarioSchema`,
 *     `briefSchema`, `announcementSchema`) before any logic executes.
 *   - `timingSafeEqual` is used for access code comparison — must never be changed
 *     to a plain `===` comparison, which would introduce a timing oracle.
 *   - The `generateBrief()` endpoint delegates output validation to
 *     `validateOpsResponse` in the AI layer; controller trusts only validated data.
 *   - `logout()` clears the HttpOnly cookie with matching SameSite/Secure flags;
 *     any mismatch between login and logout cookie attributes will prevent clearing.
 *   - `getSnapshot()` computes risk synchronously in the request handler; for very
 *     large venue graphs this could cause measurable response latency.
 *
 * @scope-of-improvement
 *   - Extract `buildSnapshotMetrics()` from `getSnapshot()` into a separate service
 *     function so it can be unit-tested independently of the HTTP layer.
 *   - Add request-level caching (60 s TTL) to `getSnapshot()` to serve burst reads
 *     from the ops dashboard without recomputing risk on every poll.
 *   - Introduce role-based access control within ops routes (e.g. only the Operations
 *     Manager role can call `setScenario()`).
 *   - Add structured audit logging for all state-modifying endpoints (scenario change,
 *     announcement creation) with the authenticated user's identity.
 *   - Expose `generateBrief()` progress via Server-Sent Events for better UX on
 *     slow connections.
 *
 * @business-intent
 *   The operations controller is the back-end hub of the CrowdSphere AI command
 *   centre. It ensures that every crowd-management action (brief generation,
 *   announcement drafting, scenario activation) is:
 *   (1) authenticated by a valid JWT,
 *   (2) validated against a schema before processing,
 *   (3) backed by deterministic server-side risk scoring rather than AI inference,
 *   (4) logged with enough context for post-event incident review.
 *   In a live stadium environment, these guarantees are safety-critical — an
 *   unauthenticated or unvalidated action could trigger incorrect evacuation routing.
 */

import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { timingSafeEqual } from '../utils/crypto.js';
import { ValidationError, AuthError } from '../utils/errors.js';
import { loginSchema, scenarioSchema, briefSchema, announcementSchema } from '../validators/opsRequestSchema.js';
import { getState, setState } from '../data/operationsState.js';
import { generateOperationsBrief } from '../ai/operationsBriefService.js';
import { generateAnnouncement } from '../ai/announcementService.js';
import { calculateOverallRisk } from '../tools/riskEngine.js';
import { getVolunteerAvailability } from '../tools/volunteerTracker.js';
import { logger } from '../utils/logger.js';

// #What — Module-level singleton for the injected Gemini client; null until
//         setGeminiClient() is called from app.js at startup.
// #Business-Intent — Using dependency injection rather than a direct import
//   allows the controller to be unit-tested with a mock client without
//   mocking the entire Gemini SDK.
let _geminiClient = null;

/**
 * Inject the Gemini AI client instance into this controller.
 *
 * @description Called once at server startup from `app.js` after the
 *   Gemini client is created via `createGeminiClient()`. All AI-backed
 *   endpoint handlers (`generateBrief`, `createAnnouncement`) use this
 *   injected client. If never called, those handlers operate in demo-
 *   fixture mode.
 *
 * @param {Object} client - Object returned by `createGeminiClient()`.
 *   Must expose `isAvailable()`, `generateContent()`, and `generateWithRetry()`.
 * @returns {void}
 *
 * @business-intent Centralises the Gemini client lifecycle; prevents each
 *   handler from independently initialising the SDK, which would duplicate
 *   API key consumption and error handling.
 */
export function setGeminiClient(client) {
  // #What — Store the client reference in module scope so all handlers
  //         in this file share the same configured instance.
  _geminiClient = client;
}

/**
 * POST /api/ops/login
 * Authenticate an operations staff member with the venue access code.
 *
 * @description Validates the incoming JSON body against `loginSchema`, then
 *   performs a constant-time comparison of the submitted access code against
 *   the configured `OPS_ACCESS_CODE`. On success, issues a signed JWT and sets
 *   it as an HttpOnly cookie valid for 15 minutes. Also returns the token in
 *   the response body for non-browser API clients.
 *
 * @param {import('express').Request} req - Must contain `{ accessCode: string }` body.
 * @param {import('express').Response} res - Receives JWT cookie and JSON response.
 * @param {Function} next - Express error handler for forwarding errors.
 * @returns {Promise<void>}
 *
 * @risk-area
 *   The access code comparison MUST use `timingSafeEqual` to prevent timing
 *   oracle attacks. Switching to `===` or `accessCode === config.opsAccessCode`
 *   would expose the comparison to character-by-character timing measurement.
 *
 * @business-intent
 *   This is the sole entry point for ops staff authentication. A successful
 *   login grants the 'operations' JWT role, which gates all crowd-management
 *   commands on the ops dashboard. The short 15-minute token TTL minimises
 *   the blast radius of a stolen token or unattended terminal.
 *
 * @validation-note
 *   Validation is schema-first (Zod) and timing-safe (crypto); errors are
 *   forwarded to the global handler without exposing which check failed.
 */
export async function login(req, res, next) {
  try {
    // #What — Validate request body shape before touching any business logic
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid login request');
    }

    const { accessCode } = parsed.data;

    // #Risk-Area — timingSafeEqual is mandatory here; plain equality would allow
    //   an attacker to guess the access code one character at a time by measuring
    //   server response times. This must NOT be changed to `===`.
    // @human-approval-required — Any change to this comparison logic requires
    //   a security engineering review before merging.
    const isValid = timingSafeEqual(accessCode, config.opsAccessCode);

    if (!isValid) {
      // #Business-Intent — Log failed attempts for anomaly detection (repeated failures
      //   from the same IP may indicate a brute-force attempt, even with rate limiting).
      logger.warn('Failed ops login attempt', { requestId: req.id });
      throw new AuthError('Invalid access code');
    }

    // #What — Issue a short-lived JWT containing only the role claim;
    //         no personally identifiable information is embedded.
    const token = jwt.sign({ role: 'operations' }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    });

    // #What — Set as HttpOnly so JavaScript in the browser cannot read the token,
    //         mitigating XSS-based token theft.
    // #Risk-Area — SameSite:'none' is required in production for cross-origin
    //   cookie delivery, but MUST be paired with Secure:true to be valid.
    //   In development, SameSite:'strict' prevents CSRF without HTTPS overhead.
    res.cookie('ops_token', token, {
      httpOnly: true,
      sameSite: config.isProduction ? 'none' : 'strict',
      secure: config.isProduction,
      maxAge: 15 * 60 * 1000, // #What — 15-minute cookie lifetime mirrors JWT TTL
    });

    logger.info('Ops login successful', { requestId: req.id });

    // #What — Also return the token in the response body to support non-browser
    //         API clients (e.g. mobile apps, CI scripts) that can't use cookies.
    res.json({
      success: true,
      data: { token, role: 'operations', expiresIn: config.jwtExpiresIn },
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/ops/logout
 * Invalidate the ops staff session by clearing the JWT cookie.
 *
 * @description Clears the `ops_token` HttpOnly cookie using the same flags
 *   that were set during login (SameSite, Secure). Without matching flags,
 *   the browser may not clear the cookie, leaving the session active.
 *
 * @param {import('express').Request} req - Authenticated request (requireAuth middleware).
 * @param {import('express').Response} res - Receives confirmation JSON.
 * @returns {void}
 *
 * @risk-area
 *   Cookie clearing MUST use identical SameSite/Secure/HttpOnly attributes as
 *   the original Set-Cookie. A flag mismatch causes the browser to treat them
 *   as different cookies, leaving the ops session live past logout.
 *
 * @business-intent
 *   Explicit logout allows ops staff to end their session immediately at end-of-
 *   shift without waiting for the 15-minute JWT expiry, preventing unauthorised
 *   use of an unattended ops terminal.
 */
export function logout(req, res) {
  // #What — Clear the cookie with matching attributes; mismatched SameSite/Secure
  //         would silently fail and leave the token active in the browser.
  res.clearCookie('ops_token', {
    httpOnly: true,
    sameSite: config.isProduction ? 'none' : 'strict',
    secure: config.isProduction
  });
  res.json({ success: true, data: { message: 'Logged out successfully' }, requestId: req.id });
}

/**
 * GET /api/ops/snapshot
 * Return the current full operational state with aggregated metrics.
 *
 * @description Fetches the live operations state, computes the overall risk score
 *   across all zones, and retrieves volunteer availability. Assembles a metrics
 *   summary object providing at-a-glance KPIs for the ops dashboard: occupancy,
 *   risk, incidents, volunteers, accessibility, and transport disruptions.
 *
 * @param {import('express').Request} req - Authenticated request.
 * @param {import('express').Response} res - Receives the full snapshot JSON.
 * @param {Function} next - Express error handler.
 * @returns {void}
 *
 * @risk-area
 *   Risk scoring is computed synchronously in the request handler. For very
 *   large venue graphs (e.g. multi-stadium configurations), this could block
 *   the event loop. Consider moving to a cached background computation.
 *
 * @business-intent
 *   The snapshot endpoint is polled by the ops dashboard every few seconds
 *   to keep the risk display and crowd metrics current. The structured metrics
 *   object is designed to feed the summary panel widgets without requiring the
 *   client to re-aggregate raw zone data.
 */
export function getSnapshot(req, res, next) {
  try {
    const state = getState();

    // #What — Compute overall risk deterministically from the current crowd and transport
    //         state; this is never delegated to the AI model.
    // @hallucination-guard — Risk score comes from the deterministic riskEngine, not Gemini.
    const risk = calculateOverallRisk(state.crowd, state.transport);

    // #What — Volunteer availability is a simulated model; in production this
    //         would be backed by a real-time volunteer management system.
    // #Uncertain — getVolunteerAvailability() uses static baseline data; it does
    //   not reflect real-time check-ins or dynamic redeployment during an event.
    const volunteers = getVolunteerAvailability();

    // #What — Count transport routes that are not in 'operational' status
    const transportDisruptions = state.transport.filter((t) => t.status !== 'operational').length;

    // #What — Accessibility disruptions: count obstructed zones + offline elevators
    const accessibilityDisruptions =
      state.crowd.zones.filter((z) => z.accessibilityObstruction).length +
      state.elevatorOutages.length;

    // #Business-Intent — High-risk zones (score >= 50) are explicitly surfaced so the
    //   dashboard can highlight them in red without the client recalculating thresholds.
    const highRiskZones = risk.zoneRisks.filter((z) => z.score >= 50);

    // #What — Find the worst-case queue across all zones for the summary KPI
    const longestQueue = state.crowd.zones.reduce(
      (max, z) => Math.max(max, z.queueMinutes || 0), 0,
    );

    res.json({
      success: true,
      data: {
        scenarioId: state.scenarioId,
        scenarioName: state.scenarioName,
        scenarioDescription: state.scenarioDescription,
        snapshotVersion: state.snapshotVersion,
        snapshotTimestamp: state.snapshotTimestamp,
        crowd: state.crowd,
        transport: state.transport,
        elevatorOutages: state.elevatorOutages,
        metrics: {
          // #What — Average occupancy across all zones as a single stadium-level KPI
          stadiumOccupancyPct: Math.round(
            state.crowd.zones.reduce((sum, z) => sum + z.occupancyPct, 0) / state.crowd.zones.length,
          ),
          overallRisk: risk.category,
          overallRiskScore: risk.score,
          highestRiskZone: risk.highestRiskZone?.zoneName || 'None',
          highRiskZoneCount: highRiskZones.length,
          longestQueueMinutes: longestQueue,
          activeIncidentCount: state.crowd.incidents.filter((i) => i.status !== 'resolved').length,
          availableVolunteers: volunteers.totalAvailable,
          volunteerShortage: volunteers.shortage,
          accessibilityDisruptions,
          transportDisruptions,
        },
        // #What — Expose AI availability so the dashboard can show the correct
        //         "AI brief" or "demo fixture" UI state without a separate API call.
        geminiAvailable: _geminiClient?.isAvailable() ?? false,
      },
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/ops/scenario
 * Switch the active crowd simulation scenario.
 *
 * @description Validates the requested scenarioId, then calls `setState()` to
 *   replace the in-memory operations state with the scenario's pre-loaded crowd
 *   and transport data. Used for training exercises and live demo switching.
 *
 * @param {import('express').Request} req - Must contain `{ scenarioId: string }` body.
 * @param {import('express').Response} res - Receives the new scenario metadata.
 * @param {Function} next - Express error handler.
 * @returns {void}
 *
 * @risk-area
 *   Scenario switching replaces the entire in-memory state atomically. If two
 *   concurrent ops users call this simultaneously, the last write wins. For
 *   production multi-operator environments, add optimistic concurrency control.
 *
 * @business-intent
 *   Allows the ops team to quickly load pre-defined crowd scenarios (e.g. 'high
 *   occupancy peak', 'evacuation drill') for training and to demonstrate the
 *   system's response capabilities to venue management without a live event.
 */
export function setScenario(req, res, next) {
  try {
    // #What — Validate scenarioId against the Zod schema before touching state
    const parsed = scenarioSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(`Invalid scenario: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
    }

    // #What — setState replaces the entire in-memory operations state atomically
    const newState = setState(parsed.data.scenarioId);
    logger.info('Scenario changed', { scenarioId: parsed.data.scenarioId, requestId: req.id });

    res.json({
      success: true,
      data: {
        scenarioId: newState.scenarioId,
        scenarioName: newState.scenarioName,
        snapshotVersion: newState.snapshotVersion,
      },
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/ops/brief
 * Generate an AI-powered structured operations brief for the current venue state.
 *
 * @description Validates the request, fetches the current operations state, and
 *   delegates to `generateOperationsBrief()` which orchestrates Gemini tool-calling
 *   and output schema validation. The brief includes risk assessment, priority zones,
 *   incident summaries, and recommended actions. Falls back to a fixture brief if
 *   Gemini is unavailable or the response fails validation.
 *
 * @param {import('express').Request} req - Authenticated request with optional body.
 * @param {import('express').Response} res - Receives the validated operations brief.
 * @param {Function} next - Express error handler.
 * @returns {Promise<void>}
 *
 * @risk-area
 *   AI output validation is enforced in `generateOperationsBrief()` via Zod schema
 *   checks. If validation passes but the content is semantically incorrect (e.g.
 *   wrong zone names), the brief is still returned. Semantic validation is a future
 *   improvement.
 *
 * @business-intent
 *   The AI brief is the central intelligence output of CrowdSphere AI. Operations
 *   managers use it to get a structured, prioritised view of the venue's safety
 *   posture in seconds rather than manually aggregating zone data. The server-side
 *   validation ensures Gemini hallucinations never reach the ops dashboard.
 *
 * @validation-note
 *   All AI output is schema-validated before this handler returns it. The client
 *   should never receive an unvalidated AI response.
 */
export async function generateBrief(req, res, next) {
  try {
    // #What — Validate brief request body (currently just checks request format)
    const parsed = briefSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid brief request');
    }

    const state = getState();
    const startTime = Date.now();

    // #What — Delegate AI orchestration to the service layer; this controller
    //         does not directly call Gemini or process tool results.
    // @hallucination-guard — generateOperationsBrief validates AI output against
    //   a Zod schema before returning; invalid responses fall back to a fixture.
    const brief = await generateOperationsBrief(_geminiClient, state);

    logger.info('Operations brief generated', { durationMs: Date.now() - startTime, requestId: req.id });

    res.json({
      success: true,
      data: brief,
      meta: {
        // #What — Include timing so ops staff can see how long brief generation took
        aiRequestTimeMs: Date.now() - startTime,
        geminiAvailable: _geminiClient?.isAvailable() ?? false,
        // #What — Include snapshotVersion so the client can detect if the brief is stale
        snapshotVersion: state.snapshotVersion,
      },
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/ops/announcement
 * Generate an AI-drafted PA announcement for specified audience and language.
 *
 * @description Validates the announcement request (audience type, language,
 *   tone, message type), passes to `generateAnnouncement()` which uses the
 *   Gemini model to draft a clear, appropriately-toned PA announcement.
 *   The draft requires human approval before broadcast — the server enforces
 *   this by returning `requiresApproval: true` in the response.
 *
 * @param {import('express').Request} req - Body must contain audience, language,
 *   tone, and messageType fields validated by `announcementSchema`.
 * @param {import('express').Response} res - Receives the drafted announcement object.
 * @param {Function} next - Express error handler.
 * @returns {Promise<void>}
 *
 * @risk-area
 *   AI-generated announcements go to a PA system reaching thousands of fans.
 *   An incorrect or panicking message could cause dangerous crowd reactions.
 *   The `requiresApproval: true` flag in the response MUST be respected by the
 *   client to prevent automatic broadcast without human review.
 *
 * @business-intent
 *   AI-assisted announcement drafting saves operations managers significant time
 *   during critical incidents (evacuations, medical emergencies) when every
 *   second counts. However, human approval is a non-negotiable safety gate —
 *   no AI draft should ever be broadcast without a named staff member reviewing
 *   and explicitly approving it.
 *
 * @validation-note
 *   `requiresApproval: true` is set by the announcement service layer, not this
 *   controller. Controllers must never override or strip this field.
 */
export async function createAnnouncement(req, res, next) {
  try {
    // #What — Validate all announcement parameters before invoking the AI service
    const parsed = announcementSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(`Invalid announcement request: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
    }

    const state = getState();
    const startTime = Date.now();

    // #What — AI service generates the announcement text; may fall back to a template
    //         if Gemini is unavailable or output validation fails
    // @human-approval-required — The returned announcement must be reviewed and explicitly
    //   approved by an ops manager before broadcasting on the PA system.
    const announcement = await generateAnnouncement(parsed.data, _geminiClient, state);

    // #Business-Intent — Log audience and language for post-event audit: which announcements
    //   were drafted, when, and for which demographics.
    logger.info('Announcement generated', { audience: parsed.data.audience, language: parsed.data.language, requestId: req.id });

    res.json({
      success: true,
      data: announcement,
      meta: { aiRequestTimeMs: Date.now() - startTime, geminiAvailable: _geminiClient?.isAvailable() ?? false },
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}
