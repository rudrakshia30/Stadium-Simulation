/**
 * @module controllers/fanController
 * @description Fan-facing AI assistant and route calculation controller.
 *   Exposes two endpoints used by the CrowdSphere fan web application:
 *
 *   1. `POST /api/fan/chat` — Sends a fan's natural-language message to the
 *      Gemini-powered Fan Assistant, which can look up routes, facilities,
 *      crowd density, and transport status via deterministic tool calls.
 *
 *   2. `GET /api/fan/route` — Computes a shortest-path, accessibility-aware
 *      route between two venue nodes using Dijkstra's algorithm. This endpoint
 *      is entirely deterministic and does NOT involve the AI model.
 *
 *   Both endpoints consume the current live operations state (crowd snapshot,
 *   elevator outages, closed edges) to provide real-time accurate responses.
 *   All AI-generated responses are validated by `validateFanResponse()` before
 *   being returned to the client; failed validation falls back to a safe human
 *   handoff message.
 *
 * @pr-changes
 *   - Added `setGeminiClient()` dependency injection pattern matching
 *     `opsController.js` for consistency and testability.
 *   - `chat()` now logs `language` alongside `durationMs` to enable multilingual
 *     usage analytics for the accessibility team.
 *   - `getRoute()` passes `elevatorOutages` and `closedEdges` from the live
 *     operations state to ensure real-time routing accuracy.
 *   - Both handlers forward errors to `next(err)` so the global error handler
 *     produces consistent JSON error shapes for the React client.
 *
 * @validation-review
 *   - `fanChatSchema` enforces `maxMessageLength` (2000 chars) and blocks empty
 *     messages before the AI service is invoked; verify the client also enforces
 *     this to reduce unnecessary round trips.
 *   - `routeRequestSchema` validates `from` and `to` as non-empty strings but
 *     does NOT validate that they exist in the venue graph; that check is
 *     performed inside `calculateRoute()` which throws `NotFoundError`.
 *   - `getRoute()` uses `req.query` (URL params), not `req.body`; URL parameters
 *     are always strings, so schema coercion must handle boolean `preferences.*`
 *     values (e.g. `?wheelchair=true` arrives as the string `"true"`).
 *   - The `fromCache: false` field in the route response is a placeholder; a
 *     real cache integration is not yet implemented (see scope of improvement).
 *
 * @scope-of-improvement
 *   - Add response caching for `getRoute()`: identical (from, to, preferences,
 *     snapshotVersion) tuples could return cached routes for the duration of a
 *     snapshot window (30 s), reducing repeated Dijkstra computations.
 *   - Introduce per-user conversation state persistence (e.g. Redis, in-memory
 *     session store) so the Fan Assistant can maintain multi-turn context across
 *     requests from the same session without the client sending full history.
 *   - Add `Accept-Language` header parsing to auto-detect the fan's preferred
 *     language as a fallback when `language` is not explicitly supplied.
 *   - Rate-limit the `chat` endpoint per-session (not just per-IP) to prevent
 *     a single user from exhausting Gemini quota for others.
 *
 * @business-intent
 *   The fan controller is the primary public interface of CrowdSphere AI for
 *   the 60,000+ fans attending a live event. Accessibility-compliant routing
 *   is a legal and ethical obligation; any regression in the route calculation
 *   path (e.g. wheelchair routing that silently uses stairs) could cause harm.
 *   The AI chat path enriches the fan experience but must never compromise
 *   safety: all AI output is validated, and failed validation always defaults
 *   to a human handoff message directing fans to Information Desks.
 */

import { handleFanRequest } from '../ai/fanAssistantService.js';
import { calculateRoute } from '../tools/routingEngine.js';
import { fanChatSchema, routeRequestSchema } from '../validators/fanRequestSchema.js';
import { getState } from '../data/operationsState.js';
import { ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

// #What — Module-level singleton for the injected Gemini client; null until
//         setGeminiClient() is called at server startup.
// #Business-Intent — Dependency injection allows unit tests to pass a mock
//   client without mocking the entire @google/genai SDK module.
let _geminiClient = null;

/**
 * Inject the Gemini AI client instance into this controller.
 *
 * @description Called once at server startup from `app.js` after the Gemini
 *   client factory returns a configured client object. If called with a null or
 *   unavailable client, AI chat falls back to demo-fixture mode automatically
 *   (handled by `fanAssistantService`). Route calculation is unaffected.
 *
 * @param {Object} client - Client object from `createGeminiClient()`.
 *   Expected to expose `isAvailable()`, `generateContent()`, and `generateWithRetry()`.
 * @returns {void}
 *
 * @business-intent Allows the fan chat feature to be enabled or disabled at
 *   runtime by injecting an available or unavailable client without code changes.
 */
export function setGeminiClient(client) {
  // #What — Store in module scope; shared across all request handler calls.
  _geminiClient = client;
}

/**
 * POST /api/fan/chat
 * Handle a fan's natural-language question via the AI Fan Assistant.
 *
 * @description Validates the incoming message and conversation context, then
 *   delegates to `handleFanRequest()` which runs the Gemini model with
 *   deterministic tool-calling for routing, facility lookup, and crowd queries.
 *   The validated, safe AI response is returned as JSON. If validation fails or
 *   Gemini is unavailable, the service returns a human handoff fallback response.
 *
 * @param {import('express').Request} req - Must contain a JSON body matching
 *   `fanChatSchema` (message, language, conversationHistory, preferences).
 * @param {import('express').Response} res - Receives the AI assistant JSON response.
 * @param {Function} next - Express error handler for forwarding validation errors.
 * @returns {Promise<void>}
 *
 * @risk-area
 *   AI output is validated in the service layer before this handler sees it.
 *   However, if `validateFanResponse()` has a bug, unvalidated AI content could
 *   reach this handler. This controller trusts the service layer's validation;
 *   any weakening of that validation is a safety risk.
 *
 * @business-intent
 *   The fan chat endpoint is the primary fan-visible feature of CrowdSphere AI.
 *   It must be resilient: even under Gemini quota exhaustion or outage, fans
 *   receive a safe "speak to staff" fallback. This ensures no fan is left
 *   without guidance during a safety-critical situation.
 *
 * @validation-note
 *   `fanChatSchema` enforces a 2000-character message limit server-side, even
 *   though the client also enforces it. Belt-and-suspenders for AI input safety.
 */
export async function chat(req, res, next) {
  try {
    // #What — Validate message, language, history, and preferences before any AI call
    const parsed = fanChatSchema.safeParse(req.body);
    if (!parsed.success) {
      // #Business-Intent — ValidationError returns a structured 400 so the React
      //   client can display specific field-level errors rather than a generic failure.
      throw new ValidationError(`Invalid request: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
    }

    const operationsState = getState();
    const startTime = Date.now();

    // #What — Delegate the full AI request cycle (context building, Gemini call,
    //         tool execution, response validation, fallback) to the service layer.
    // @hallucination-guard — handleFanRequest validates AI output via validateFanResponse()
    //   before returning; the controller receives only schema-valid or fallback data.
    const aiResponse = await handleFanRequest(parsed.data, _geminiClient, operationsState);

    // #Business-Intent — Log language for multilingual usage analytics;
    //   durationMs for latency monitoring; requestId for distributed tracing.
    logger.info('Fan chat processed', {
      language: parsed.data.language,
      durationMs: Date.now() - startTime,
      requestId: req.id,
    });

    res.json({
      success: true,
      data: aiResponse,
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/fan/route
 * Calculate a real-time, deterministic route between two venue locations.
 *
 * @description Parses and validates query parameters, fetches the current
 *   operations state to get live elevator outages and closed edges, and runs
 *   Dijkstra's shortest-path algorithm via `calculateRoute()`. The result
 *   includes step-by-step directions, crowd warnings, accessibility status,
 *   and estimated walking time.
 *
 *   This endpoint does NOT invoke the AI model — all routing is deterministic.
 *
 * @param {import('express').Request} req - Query params: `from`, `to`, and
 *   optional accessibility `preferences` (wheelchair, stepFree, avoidStairs, etc.).
 * @param {import('express').Response} res - Receives the full RouteResult JSON.
 * @param {Function} next - Express error handler for validation and routing errors.
 * @returns {Promise<void>}
 *
 * @risk-area
 *   Accessibility routing is safety-critical: routing a wheelchair user through
 *   stairs is a legal and physical-safety failure. The `wheelchair` and `stepFree`
 *   query params MUST be validated and correctly passed to `calculateRoute()`.
 *   Any schema coercion of boolean strings (query params are always strings) must
 *   be verified to produce correct booleans, not truthy string values.
 *
 * @business-intent
 *   Fans may use this endpoint directly (e.g. via QR code scan) to get an
 *   up-to-date route when crowd conditions change mid-event. The inclusion of
 *   live elevator outages and closed edges ensures routes remain valid even
 *   as the venue's physical state changes throughout the day.
 *
 * @validation-note
 *   `from` and `to` are validated as non-empty strings by the schema, but node
 *   existence is checked inside `calculateRoute()`. A `NotFoundError` will be
 *   forwarded to `next()` and serialised as a 404 by the global error handler.
 */
export async function getRoute(req, res, next) {
  try {
    // #What — Parse and validate query parameters; routeRequestSchema coerces
    //         boolean string params ('true'/'false') to actual booleans.
    // #Uncertain — Confirm that Zod schema uses z.boolean() with coerce or a
    //   custom transform for query string boolean values; plain z.boolean() will
    //   reject the string 'true' on query params without coercion.
    const parsed = routeRequestSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError(`Invalid request: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
    }

    const state = getState();
    const startTime = Date.now();

    // #What — Calculate the shortest path using Dijkstra with real-time crowd
    //         awareness and the live operations state for outages/closures.
    // #Business-Intent — Using live elevatorOutages and closedEdges ensures fans
    //   are never routed through physically unavailable paths during the event.
    const route = calculateRoute(
      {
        from: parsed.data.from,
        to: parsed.data.to,
        // #What — Spread parsed preferences (wheelchair, stepFree, avoidStairs,
        //         avoidCrowds, avoidLongWalking) into the options object.
        ...parsed.data.preferences,
        elevatorOutages: state.elevatorOutages,
        closedEdges: state.closedEdges,
      },
      state.crowd,
    );

    logger.info('Route calculated', { from: parsed.data.from, to: parsed.data.to, durationMs: Date.now() - startTime });

    res.json({
      success: true,
      data: route,
      meta: {
        calculationTimeMs: Date.now() - startTime,
        // #Uncertain — fromCache is hardcoded false; route caching is a future
        //   improvement. When implemented, this should reflect actual cache status.
        fromCache: false,
        snapshotVersion: state.snapshotVersion,
      },
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}
