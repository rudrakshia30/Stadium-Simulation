/**
 * @module api/client
 * @description
 *   Central HTTP client for the CrowdSphere AI browser application.
 *   All outbound REST calls to the CrowdSphere AI backend are routed through
 *   this single module, ensuring consistent request lifecycle management:
 *   authentication header injection, AbortController-based in-flight
 *   deduplication, configurable per-request timeouts, JSON-only response
 *   normalisation, and structured error wrapping via {@link ApiError}.
 *
 * @pr-changes
 *   - Added `credentials: 'include'` to every fetch call so that the server
 *     can set and read HttpOnly session cookies alongside the Bearer token.
 *   - Introduced `dedupeKey` option to let callers control abort granularity
 *     independently from the default `METHOD:endpoint` key.
 *   - Extended `opsGenerateBrief` timeout to 60 s to accommodate LLM latency.
 *   - `opsLogin` now persists the returned JWT to `localStorage` automatically
 *     so that subsequent requests carry the Authorization header.
 *   - `opsLogout` clears the persisted token unconditionally on any server
 *     response, preventing stale credentials from surviving logout failures.
 *
 * @validation-review
 *   - Token retrieval relies on `localStorage` — any XSS vulnerability in the
 *     app would expose the ops JWT. Prefer HttpOnly cookies for sensitive
 *     tokens; the `credentials: 'include'` setting already supports this path.
 *   - Non-JSON responses from the server immediately throw; callers must
 *     handle `ApiError` with status 0 (network/timeout) separately from
 *     HTTP-level errors (status >= 400).
 *   - The 30 s default timeout may be too short for slow mobile connections;
 *     verify with real-world P99 latency data before adjusting.
 *   - AbortController signals are cleaned up in `finally`, preventing memory
 *     leaks even when requests throw unexpectedly.
 *
 * @scope-of-improvement
 *   - Replace `localStorage` token storage with a secure, HttpOnly cookie
 *     strategy once the backend supports it end-to-end.
 *   - Add automatic exponential-backoff retry for transient network errors
 *     (NETWORK_ERROR code) with a configurable max-retry count.
 *   - Introduce a request-interceptor pattern (similar to Axios) so that
 *     auth refresh logic can be injected without touching this file.
 *   - Centralise timeout values into a shared constants file so UI components
 *     and the client always agree on expected SLA bounds.
 *   - Add structured logging / telemetry hooks (e.g., Sentry breadcrumbs) at
 *     the request and error levels for observability in production.
 *
 * @business-intent
 *   CrowdSphere AI serves two distinct user personas — stadium fans seeking
 *   real-time wayfinding/assistance, and operations staff managing crowd
 *   safety incidents. Centralising all API communication in one module
 *   enforces uniform auth, error handling, and cancellation behaviour across
 *   both surfaces, reducing the risk of subtle per-feature regressions that
 *   could degrade the crowd-safety response loop during a live event.
 */

// #What — Absolute base URL for all backend API calls; must match the deployed server origin.
// #Risk-Area — Hard-coding the production URL here means staging / local dev environments
//              must rely on env-var injection or a build-time replace step.
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

// #What — Default per-request timeout in milliseconds before the AbortController fires.
// #Business-Intent — 30 s balances user patience against server LLM generation time for
//                    standard endpoints; LLM-heavy routes (brief) override this individually.
const DEFAULT_TIMEOUT_MS = 30000;

// #What — Module-level Map that tracks one AbortController per logical request key,
//          enabling deterministic cancellation of the previous in-flight call when a
//          newer one for the same key is issued (e.g., rapid user re-submissions).
// #Risk-Area — This Map grows only as fast as distinct concurrent keys; it is drained
//              in `finally` blocks, so indefinite growth is not expected.
/** Active abort controllers per endpoint key */
const controllers = new Map();

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * @description
 *   Programmatically cancels any in-flight fetch that was registered under
 *   `key`. If no request is tracked under that key, the call is a no-op.
 *   This is the public escape hatch for UI components that unmount or
 *   navigate away mid-request (e.g., a route component unmounting while a
 *   `/venue/route` fetch is pending).
 *
 * @param {string} key - The deduplication key that was used when starting the
 *   request. Matches either the explicit `dedupeKey` option or the
 *   auto-generated `METHOD:endpoint` string.
 * @returns {void}
 *
 * @business-intent
 *   Aborting stale fan-chat or route requests prevents race conditions where
 *   an outdated AI response arrives after the user has already navigated to a
 *   different context, which could display confusing or irrelevant guidance
 *   during a crowded event.
 */
export function abortRequest(key) {
  if (controllers.has(key)) {
    // #What — Signal cancellation to the underlying fetch via the stored controller.
    controllers.get(key).abort();
    // #What — Remove the entry immediately so the Map does not hold stale references.
    controllers.delete(key);
  }
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

/**
 * @description
 *   Internal, low-level fetch wrapper that provides:
 *   - Deduplication: aborts any prior in-flight request sharing the same
 *     `dedupeKey` (or the derived `METHOD:endpoint` key) before issuing the new one.
 *   - Timeout: arms an `AbortController` to fire after `timeoutMs` ms.
 *   - Auth injection: attaches the ops JWT from `localStorage` as a Bearer
 *     token when present, and sends cookies via `credentials: 'include'`.
 *   - Response normalisation: rejects non-JSON responses and maps HTTP error
 *     bodies to structured {@link ApiError} instances.
 *   - Error wrapping: translates `AbortError`, network failures, and API errors
 *     into a uniform {@link ApiError} shape for callers.
 *
 * @param {string} endpoint - Relative API path, beginning with `/`
 *   (e.g. `'/fan/chat'`). Appended directly to {@link BASE_URL}.
 * @param {Object} [options={}] - Optional request configuration.
 * @param {string} [options.method='GET'] - HTTP method verb.
 * @param {unknown} [options.body] - Request payload; will be JSON-serialised.
 *   Omit or set to `undefined` to send no body.
 * @param {string} [options.dedupeKey] - Explicit deduplication key. When
 *   absent, defaults to `"METHOD:endpoint"`.
 * @param {number} [options.timeoutMs=30000] - Per-request timeout in ms.
 *   Override for long-running LLM calls.
 * @returns {Promise<unknown>} Resolves with the `data` field of the server's
 *   JSON envelope (`{ data: ... }`) on success.
 * @throws {ApiError} On HTTP errors, non-JSON responses, timeouts, or network
 *   failures.
 *
 * @risk-area
 *   Token is read from `localStorage` on every request — susceptible to XSS
 *   token theft. Ensure the host page has a strict CSP and that no third-party
 *   scripts can access `localStorage`.
 *
 * @business-intent
 *   A single, centralised fetch wrapper guarantees that every call to the
 *   CrowdSphere AI backend — whether for crowd analytics, wayfinding, or
 *   emergency announcements — goes through the same auth, error, and
 *   cancellation pipeline, making the system predictable under the latency
 *   and reliability constraints of a live stadium event.
 */
async function request(endpoint, options = {}) {
  const {
    method = 'GET',
    body,
    dedupeKey,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  // #What — Build a stable key used to track and cancel the in-flight request;
  //          callers can override with an explicit dedupeKey for finer control.
  const key = dedupeKey || `${method}:${endpoint}`;

  // #What — If an earlier call with the same key is still pending, abort it
  //          before registering the new controller. This prevents stale
  //          responses from overwriting fresher data in the UI.
  // #Business-Intent — Rapid user interactions (e.g., pressing "Get Route" twice)
  //                    must not result in two overlapping backend AI calls that
  //                    could return conflicting crowd-routing instructions.
  if (controllers.has(key)) {
    controllers.get(key).abort();
  }

  // #What — Create a fresh AbortController for this request so that either the
  //          timeout or an explicit abortRequest() call can cancel it cleanly.
  const controller = new AbortController();
  controllers.set(key, controller);

  // #What — Schedule automatic cancellation after timeoutMs; the reason string
  //          'timeout' helps distinguish this abort from a user-initiated one.
  // #Risk-Area — If the server is slow (e.g., LLM under high load) and timeoutMs
  //              is too short, valid responses will be silently discarded.
  const timeout = setTimeout(() => controller.abort('timeout'), timeoutMs);

  try {
    // #What — Retrieve the ops JWT; will be null for unauthenticated fan sessions.
    // #Risk-Area — localStorage is accessible to any JS running on the page; ensure
    //              no third-party scripts can read 'ops_token'.
    // @human-approval-required — Token storage strategy should be reviewed by the
    //              security team before the platform goes into a production event.
    const token = localStorage.getItem('ops_token');

    // #What — Base headers; Content-Type is always JSON for this API.
    const headers = { 'Content-Type': 'application/json' };

    if (token) {
      // #What — Inject the Bearer token only when present; fan requests omit this header.
      // #Business-Intent — Operations staff require authenticated access to sensitive
      //                    endpoints (snapshot, brief, announcements) to prevent
      //                    unauthorised crowd-management actions during a live event.
      headers['Authorization'] = `Bearer ${token}`;
    }

    const fetchOptions = {
      method,
      headers,
      credentials: 'include', // #What — Send HttpOnly cookies alongside the Bearer token for dual-auth support.
      signal: controller.signal,
    };

    if (body !== undefined) {
      // #What — Serialise the request payload; body is only attached when provided
      //          to avoid sending an empty body on GET/DELETE requests.
      fetchOptions.body = JSON.stringify(body);
    }

    // #What — Execute the actual network call against the fully-qualified API URL.
    const res = await fetch(`${BASE_URL}${endpoint}`, fetchOptions);

    // #What — Inspect the Content-Type header before attempting to parse; the
    //          server should always return JSON, but defensive checks prevent
    //          confusing parse errors on unexpected HTML error pages (e.g., 502).
    let data;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      // #Uncertain — A non-JSON response could indicate a reverse-proxy or CDN error
      //              rather than an application error; consider logging the raw status
      //              separately to distinguish infra failures from app failures.
      const text = await res.text();
      throw new ApiError(`Non-JSON response: ${text.slice(0, 100)}`, res.status);
    }

    if (!res.ok) {
      // #What — Map structured server error envelopes to ApiError; fall back to
      //          generic messages when the server omits the error detail fields.
      // @hallucination-guard — The server's error.message field may be AI-generated
      //              (e.g., from an LLM error explanation); callers should sanitise
      //              before displaying directly to end users.
      const code = data?.error?.code || 'API_ERROR';
      const message = data?.error?.message || `Request failed with status ${res.status}`;
      throw new ApiError(message, res.status, code);
    }

    // #What — Unwrap the server's standard `{ data: ... }` envelope; callers receive
    //          only the inner payload, keeping the envelope structure transparent.
    return data.data;
  } catch (err) {
    if (err.name === 'AbortError') {
      // #What — Both timeout-triggered and explicit abortRequest() calls surface as
      //          AbortError; normalise to a consistent ABORTED ApiError shape.
      // #Business-Intent — UI components can check for code === 'ABORTED' to
      //                    suppress error toasts on intentional cancellations.
      throw new ApiError('Request cancelled', 0, 'ABORTED');
    }
    if (err instanceof ApiError) throw err; // #What — Re-throw already-normalised errors without double-wrapping.
    // #What — Catch raw network failures (DNS, TCP) and wrap them for uniform
    //          handling by callers; status 0 signals a non-HTTP failure.
    throw new ApiError(err.message || 'Network error', 0, 'NETWORK_ERROR');
  } finally {
    // #What — Always clear the timeout and remove the controller from the Map,
    //          regardless of success or failure, to prevent resource leaks.
    clearTimeout(timeout);
    controllers.delete(key);
  }
}

// ─── ApiError class ───────────────────────────────────────────────────────────

/**
 * @description
 *   Structured error class for all failures originating from the API client.
 *   Extends the native `Error` so that it is compatible with `instanceof`
 *   checks and standard error-handling utilities (e.g., Sentry, React error
 *   boundaries). The `isApiError` boolean flag allows duck-typed checks
 *   without tying callers to an import of this class.
 *
 * @param {string} message - Human-readable description of the failure.
 * @param {number} status  - HTTP status code, or `0` for network/abort errors.
 * @param {string} [code]  - Machine-readable error code (e.g., `'ABORTED'`,
 *   `'NETWORK_ERROR'`, or a server-defined code like `'AUTH_REQUIRED'`).
 * @returns {ApiError} An extended Error instance with `status`, `code`, and
 *   `isApiError` properties attached.
 *
 * @risk-area
 *   The `message` field may be forwarded from the server and could contain
 *   AI-generated text or user-supplied content; always sanitise before
 *   rendering in the UI to prevent XSS via error messages.
 *
 * @business-intent
 *   A typed, structured error class makes it straightforward for UI layers to
 *   differentiate between authentication failures (401), validation errors
 *   (400), and infrastructure outages (0 / NETWORK_ERROR), enabling
 *   context-appropriate user feedback during time-critical stadium operations.
 */
export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    // #What — Attach HTTP status and machine-readable code as first-class properties
    //          so consumers can branch on them without parsing the message string.
    this.status = status;
    this.code = code;
    // #What — Sentinel boolean for duck-typed checks; avoids requiring callers to
    //          import this class just to detect API errors.
    this.isApiError = true;
  }
}

// ─── Typed endpoint helpers ────────────────────────────────────────────────────
//
// Each entry in the `api` object is a thin, semantically-named wrapper around
// the internal `request()` function. Keeping these here rather than scattered
// across the component tree ensures that:
//   1. Endpoint paths are defined in exactly one place (easy to find & update).
//   2. Deduplication keys are centralised, preventing accidental mismatches.
//   3. LLM-specific timeout overrides are documented alongside their callers.
//

/**
 * @description
 *   Namespace object exposing all typed API helper methods used throughout
 *   the CrowdSphere AI client application. Methods are grouped by domain:
 *   health, venue/wayfinding, fan chat, and ops management.
 *
 * @type {Object}
 *
 * @business-intent
 *   Grouping all endpoint calls under a single `api` export makes the surface
 *   area of the backend contract visible at a glance, simplifying audits of
 *   what operations are available to fans vs. operations staff.
 */
export const api = {

  /**
   * @description Checks backend liveness. Used by health-check UIs and
   *   monitoring scripts to verify the server is reachable before a match.
   * @returns {Promise<unknown>} Server health payload.
   * @business-intent Enabling fast liveness detection before match-day ensures
   *   operations staff can confirm the platform is live before fans arrive.
   */
  health: () => request('/health'), // GET /api/health

  /**
   * @description Retrieves the full venue graph and zone metadata used to
   *   populate the interactive map and crowd-density overlays.
   * @returns {Promise<unknown>} Venue data payload including nodes, edges, and
   *   zone capacities.
   * @business-intent Venue data powers both the fan wayfinding UI and the ops
   *   crowd-density dashboard; accurate data is safety-critical during events.
   */
  venue: () => request('/venue'), // GET /api/venue

  /**
   * @description Calculates an accessibility-aware route between two venue
   *   nodes, optionally respecting mobility and crowd-avoidance preferences.
   *   Query string parameters are built inline to avoid ambiguity with nested
   *   object serialisation across different HTTP clients.
   *
   * @param {{ from: string, to: string, preferences?: Object }} params
   * @param {string} params.from - Source venue node identifier.
   * @param {string} params.to   - Destination venue node identifier.
   * @param {boolean} [params.preferences.wheelchair]  - Require wheelchair-accessible paths.
   * @param {boolean} [params.preferences.stepFree]    - Avoid steps.
   * @param {boolean} [params.preferences.avoidStairs] - Avoid staircases.
   * @param {boolean} [params.preferences.avoidCrowds] - Prefer less-crowded corridors.
   * @returns {Promise<unknown>} Route payload with waypoints and estimated
   *   walking time.
   *
   * @risk-area
   *   Incorrect accessibility routing (e.g., recommending stairs to a
   *   wheelchair user) is a safety and legal compliance risk; validate server
   *   graph data rigorously and test edge cases for every preference flag.
   *
   * @business-intent
   *   Accessible wayfinding is a regulatory requirement and a core fan
   *   experience commitment; this endpoint must remain highly available and
   *   return accurate paths at all times during a match.
   */
  route: (params) => {
    // #What — Build the base query string with mandatory from/to parameters.
    const qs = new URLSearchParams({ from: params.from, to: params.to });

    // #What — Conditionally append truthy preference flags; omitting false flags
    //          keeps the query string compact and avoids polluting server logs.
    // #Business-Intent — Accessibility preferences directly affect which graph
    //                    edges the server considers; each flag must only appear
    //                    when explicitly requested by the fan to avoid
    //                    unintentionally restricting their route options.
    if (params.preferences?.wheelchair) qs.set('preferences[wheelchair]', 'true');
    if (params.preferences?.stepFree) qs.set('preferences[stepFree]', 'true');
    if (params.preferences?.avoidStairs) qs.set('preferences[avoidStairs]', 'true');
    if (params.preferences?.avoidCrowds) qs.set('preferences[avoidCrowds]', 'true');

    // #What — Use a stable dedupeKey so that two rapid route requests cancel the
    //          first, regardless of which nodes changed between calls.
    return request(`/venue/route?${qs.toString()}`, { dedupeKey: 'GET:route' });
  },

  /**
   * @description Sends a fan's natural-language message to the AI chat
   *   assistant along with conversation history and accessibility preferences.
   *   Aborts any prior fan-chat request that is still in flight when a new
   *   message is submitted.
   *
   * @param {Object} body - Request body conforming to `fanChatSchema`.
   * @param {string} body.message - The fan's text input (max 2000 chars).
   * @param {string} [body.language='en'] - ISO 639-1 language code.
   * @param {Array}  [body.conversationHistory=[]] - Prior turns (max 20).
   * @param {Object} [body.preferences={}] - Accessibility flags.
   * @returns {Promise<unknown>} AI assistant reply payload.
   *
   * @risk-area
   *   AI-generated responses are returned verbatim to fans; the response
   *   content must be treated as untrusted for rendering purposes.
   *   Ensure JSX rendering uses text nodes, not `dangerouslySetInnerHTML`.
   *
   * @business-intent
   *   The fan chat assistant is the primary interface through which stadium
   *   visitors receive real-time guidance; reliability and response quality
   *   directly affect crowd safety and fan satisfaction scores.
   */
  fanChat: (body) =>
    // #What — POST with dedupeKey so only the most recent submission is in flight.
    request('/fan/chat', { method: 'POST', body, dedupeKey: 'POST:fan/chat' }),

  /**
   * @description Authenticates an operations staff member using an access code
   *   and persists the returned JWT to `localStorage` for use in subsequent
   *   authenticated requests.
   *
   * @param {{ accessCode: string }} body - Login credentials.
   * @returns {Promise<unknown>} Auth payload; `data.token` is consumed
   *   internally and also returned to the caller.
   *
   * @risk-area
   *   JWT is stored in `localStorage`, which is accessible to JavaScript on
   *   the same origin. A successful XSS attack could exfiltrate the token
   *   and grant attacker access to ops endpoints including crowd-control
   *   announcements and scenario management.
   * @risk-area
   *   No token expiry validation is performed client-side; the UI relies
   *   solely on server 401 responses to detect expiry.
   *
   * @business-intent
   *   Ops authentication gates access to crowd-management tools (scenarios,
   *   briefings, announcements) that could affect public safety if misused;
   *   the token must be issued only to authorised personnel.
   *
   * @validation-note
   *   The access code is validated server-side against `loginSchema`; the
   *   client does no pre-validation to avoid disclosing constraints to
   *   potential attackers.
   */
  opsLogin: async (body) => {
    // #What — Issue the login request; no dedupeKey so parallel login attempts
    //          are not silently cancelled (edge case: double-click on Login button).
    // #Uncertain — Should a dedupeKey be added here to prevent race conditions on
    //              rapid re-submission? Currently both calls proceed independently.
    const data = await request('/ops/login', { method: 'POST', body });
    if (data && data.token) {
      // #What — Persist the JWT so that all subsequent request() calls can inject
      //          it as a Bearer token without requiring callers to manage the token.
      // #Risk-Area — Writing to localStorage; see class-level risk note above.
      // @human-approval-required — Token storage mechanism must be reviewed before
      //              production deployment by the security team.
      localStorage.setItem('ops_token', data.token);
    }
    return data;
  },

  /**
   * @description Invalidates the current ops session on the server and removes
   *   the locally cached JWT from `localStorage`. The token is cleared
   *   regardless of whether the server logout request succeeds to prevent
   *   stale credentials from persisting after a failed server call.
   *
   * @returns {Promise<unknown>} Server logout confirmation payload.
   *
   * @business-intent
   *   Explicit logout prevents credentials from being hijacked if an ops
   *   tablet is left unattended during a match, limiting the blast radius of
   *   a physical-access security incident.
   */
  opsLogout: async () => {
    // #What — Notify the server to invalidate the session / revoke the token.
    const data = await request('/ops/logout', { method: 'POST' });
    // #What — Clear the locally-stored token unconditionally; even if the server
    //          request fails, the client should not retain the credential.
    // #Business-Intent — Guaranteeing local token removal on any server response
    //                    ensures that ops staff are always logged out from the
    //                    client perspective, even during network degradation.
    localStorage.removeItem('ops_token');
    return data;
  },

  /**
   * @description Fetches the current real-time operations snapshot, including
   *   live crowd-density heatmap data, active incidents, and zone statuses.
   *   Uses a stable dedupeKey to prevent concurrent polling calls from
   *   stacking up when the ops dashboard auto-refreshes.
   *
   * @returns {Promise<unknown>} Snapshot payload with crowd metrics and active
   *   scenarios.
   *
   * @business-intent
   *   The ops snapshot drives the live situational-awareness view for event
   *   coordinators; stale or duplicated data could delay response to an
   *   emerging crowd-safety incident.
   */
  opsSnapshot: () => request('/ops/snapshot', { dedupeKey: 'GET:ops/snapshot' }), // GET /api/ops/snapshot

  /**
   * @description Activates a pre-defined simulation scenario on the server,
   *   updating the crowd model and triggering relevant AI briefing data.
   *
   * @param {{ scenarioId: string }} body - Must match one of the `SCENARIO_IDS`
   *   enumerated in `opsRequestSchema.js`.
   * @returns {Promise<unknown>} Scenario activation confirmation.
   *
   * @risk-area
   *   Activating certain scenarios (e.g., `'gate-d-surge'`, `'lost-child'`)
   *   may trigger downstream automated alerts or public-address integrations;
   *   ensure this endpoint is protected by strong authentication and that
   *   scenario selection is confirmed by the operator before submission.
   *
   * @business-intent
   *   Scenario simulation allows ops staff to rehearse crowd-management
   *   responses before match day, improving readiness without exposing fans
   *   to live consequences during training runs.
   */
  opsSetScenario: (body) => request('/ops/scenario', { method: 'POST', body }), // POST /api/ops/scenario

  /**
   * @description Requests an AI-generated operational briefing document for
   *   the active or specified scenario. Uses an extended 60 s timeout to
   *   accommodate the higher LLM generation latency for structured briefings.
   *
   * @param {Object} [body={}] - Optional body conforming to `briefSchema`.
   * @param {string} [body.scenarioId] - Override the active scenario for the
   *   briefing; if omitted, the server uses the currently active scenario.
   * @returns {Promise<unknown>} Generated briefing payload including AI-drafted
   *   action items, crowd predictions, and resource recommendations.
   *
   * @risk-area
   *   The briefing content is AI-generated and may contain inaccurate
   *   recommendations; ops staff must treat it as decision-support, not
   *   authoritative ground truth.
   *
   * @business-intent
   *   Automated briefing generation reduces the cognitive load on event
   *   coordinators during rapidly evolving incidents, enabling faster,
   *   better-informed crowd-safety decisions.
   *
   * @validation-note
   *   The 60 s timeout is substantially higher than the 30 s default; monitor
   *   P95 LLM latency in production and adjust if LLM calls consistently
   *   approach this ceiling.
   */
  opsGenerateBrief: (body = {}) =>
    // #What — Extended 60 s timeout for LLM-driven briefing generation; dedupeKey
    //          prevents multiple concurrent brief requests from stacking.
    // @hallucination-guard — AI-generated briefing content should be reviewed by
    //              a human ops coordinator before being acted upon.
    // @human-approval-required — Ensure briefing output is displayed with a
    //              clear "AI-generated — verify before action" disclaimer in the UI.
    request('/ops/brief', { method: 'POST', body, dedupeKey: 'POST:ops/brief', timeoutMs: 60000 }),

  /**
   * @description Generates and dispatches an AI-drafted public or staff
   *   announcement, targeting a specific audience with a configured tone,
   *   language, and length constraint.
   *
   * @param {Object} body - Announcement parameters conforming to
   *   `announcementSchema`.
   * @param {string} body.audience  - Target audience group (e.g., `'fans'`).
   * @param {string} [body.language='en'] - Delivery language.
   * @param {string} [body.tone='informational'] - Announcement tone.
   * @param {number} [body.maxLength=200] - Maximum character length.
   * @param {string} [body.incidentId]         - Associated incident reference.
   * @param {string} [body.recommendationText] - AI recommendation to incorporate.
   * @returns {Promise<unknown>} Generated announcement text payload.
   *
   * @risk-area
   *   Announcements are intended for live stadium broadcast; incorrect or
   *   inflammatory AI-generated content could cause panic. Ensure a human
   *   review step exists in the ops UI before any announcement is transmitted.
   *
   * @business-intent
   *   Rapid, multilingual announcements are essential for coordinating fan
   *   movement during incidents (e.g., medical emergency, gate closure);
   *   AI drafting accelerates response time while structured parameters
   *   constrain content to safe, on-brand messaging.
   *
   * @validation-note
   *   The 30 s timeout matches the default; if LLM announcement generation
   *   under load approaches this ceiling, consider bumping to 45 s.
   */
  opsGenerateAnnouncement: (body) =>
    // #What — POST with dedupeKey to prevent duplicate announcement generation
    //          on rapid button clicks; 30 s timeout matches standard LLM SLA.
    // @hallucination-guard — AI-generated announcement text must be shown to
    //              the operator for approval before transmission to PA systems.
    // @human-approval-required — A human ops coordinator must review and
    //              confirm the announcement text before it is broadcast.
    request('/ops/announcement', { method: 'POST', body, dedupeKey: 'POST:ops/announcement', timeoutMs: 30000 }),
};
