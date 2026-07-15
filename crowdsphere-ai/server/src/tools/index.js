/**
 * @module tools/index
 * @description Central tool registry and execution engine for CrowdSphere AI.
 *   Defines Zod validation schemas for all 10 deterministic venue tools, maps
 *   Gemini function-calling request names to their execution functions, validates
 *   incoming arguments, and executes the business logic on the server tier.
 *
 *   Every function-calling request made by Gemini passes through `executeTool()`.
 *   This enforces three safety levels:
 *   1. **Allowlist validation** — Only tools registered in `TOOL_REGISTRY` can be
 *      called; all other names throw immediately.
 *   2. **Argument schema validation** — Input arguments must pass the Zod schema
 *      assigned to the tool before execution.
 *   3. **Deterministic execution** — Actual logic (shortest path, risk assessment,
 *      playbook retrieval) is executed using server-side code — never delegating
 *      computation or numbers generation to Gemini.
 *
 * @pr-changes
 *   - Implemented Zod schemas for all 10 tools, including node ID validation
 *     against the static graph via `nodeIdSchema`.
 *   - Wrapped `calculateRoute` calls inside `execGetAccessibleRoute` to enforce
 *     `wheelchair: true` and `stepFree: true` along with elevator outage check.
 *   - Switched all execution functions to get the current snapshot dynamically
 *     via `getState()`, ensuring live data freshness.
 *   - Added `compareResponseOptions` validation and execution mappings.
 *
 * @validation-review
 *   - `nodeIdSchema` validates node existence using a static Set (`VALID_NODES`)
 *     built at module load; if nodes are added dynamically at runtime, they will
 *     be rejected until server reboot.
 *   - `execGetZoneStatus` returns `{ error: 'Zone not found' }` as a JSON object
 *     rather than throwing, allowing Gemini to receive the error context and
 *     explain it to the user.
 *   - All parameter schemas allow optional fields to degrade gracefully to
 *     defaults via `.optional().default({})`.
 *
 * @scope-of-improvement
 *   - Support dynamic node list updates in `nodeIdSchema` by querying `venue` data
 *     dynamically rather than caching the Set at module load.
 *   - Extract schemas into a separate file (`src/validators/toolSchemas.js`) to keep
 *     the registry file focused on execution wrappers.
 *   - Add execution duration logging (`durationMs`) per tool call to track API performance.
 *
 * @business-intent
 *   Function calling is a powerful but non-deterministic capability of modern LLMs.
 *   Enforcing strict Zod validation schemas and mapping them to server-controlled
 *   functions ensures Gemini acts strictly as a query parser and narrator — never
 *   generating fake routing steps or fabricated safety metrics.
 */

import { z } from 'zod';
import { calculateRoute } from './routingEngine.js';
import { calculateZoneRisk } from './riskEngine.js';
import { findFacilities } from './facilityFinder.js';
import { getTransportOptions } from './transportAdvisor.js';
import { getVolunteerAvailability } from './volunteerTracker.js';
import { getIncidentPlaybook } from './incidentPlaybook.js';
import { compareResponseOptions } from './responseComparator.js';
import { getState } from '../data/operationsState.js';
import venue from '../data/venue.js';

// ─── Input schemas ────────────────────────────────────────────────────────
// #What — Set of all valid nodes from the static venue graph; used for fast lookups.
const VALID_NODES = new Set(venue.graph.nodes);

/**
 * Validate a node ID string against the known venue graph.
 * @type {z.ZodType<string>}
 */
const nodeIdSchema = z.string().min(1).max(100).refine((v) => VALID_NODES.has(v), {
  message: 'Unknown venue node ID',
});

/**
 * Schema for routing preference flags.
 * @type {z.ZodType<Object>}
 */
const preferencesSchema = z.object({
  wheelchair: z.boolean().optional().default(false),
  stepFree: z.boolean().optional().default(false),
  avoidStairs: z.boolean().optional().default(false),
  avoidCrowds: z.boolean().optional().default(false),
  avoidLongWalking: z.boolean().optional().default(false),
}).optional().default({});

/**
 * Zod schema validation for standard routing requests.
 */
const venueRouteSchema = z.object({
  from: nodeIdSchema,
  to: nodeIdSchema,
  preferences: preferencesSchema,
});

/**
 * Zod schema validation for accessible-only routing requests.
 */
const accessibleRouteSchema = z.object({
  from: nodeIdSchema,
  to: nodeIdSchema,
  preferences: preferencesSchema,
});

/**
 * Zod schema validation for facility searches.
 */
const facilitySchema = z.object({
  type: z.string().min(1).max(50),
  accessible: z.boolean().optional(),
  nearZone: z.string().optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

/**
 * Zod schema validation for zone status queries.
 */
const zoneStatusSchema = z.object({
  zoneId: z.string().min(1).max(100).optional(),
});

/**
 * Zod schema validation for transport queries.
 */
const transportSchema = z.object({
  accessible: z.boolean().optional(),
  type: z.enum(['metro', 'bus', 'shuttle', 'taxi', 'accessible_transport', 'bicycle']).optional(),
});

/**
 * Schema for empty parameters.
 */
const emptySchema = z.object({}).optional().default({});

/**
 * Schema for risk queries.
 */
const riskSchema = z.object({
  zoneId: z.string().min(1).max(100),
});

/**
 * Schema for playbook queries.
 */
const playbookSchema = z.object({
  incidentType: z.string().min(1).max(100),
});

/**
 * Schema for volunteer availability queries.
 */
const volunteerSchema = z.object({
  zone: z.string().optional(),
});

/**
 * Schema for response comparison queries.
 */
const compareSchema = z.object({
  incidentId: z.string().min(1).max(100),
});

// ─── Tool implementations ─────────────────────────────────────────────────

/**
 * Execution wrapper for standard route calculations.
 * @param {Object} args - Validated arguments from z.safeParse.
 * @returns {Object} Route calculation result.
 */
function execGetVenueRoute(args) {
  const state = getState();
  return calculateRoute(
    { from: args.from, to: args.to, ...args.preferences },
    state.crowd,
  );
}

/**
 * Execution wrapper for accessible route calculations.
 * Enforces wheelchair and stepFree flags, injecting current elevator outages.
 * @param {Object} args - Validated arguments from z.safeParse.
 * @returns {Object} Route calculation result.
 */
function execGetAccessibleRoute(args) {
  const state = getState();
  // #Business-Intent — Accessible route calls must enforce wheelchair and stepFree preferences.
  const prefs = { ...args.preferences, wheelchair: true, stepFree: true };
  return calculateRoute(
    { from: args.from, to: args.to, ...prefs, elevatorOutages: state.elevatorOutages },
    state.crowd,
  );
}

/**
 * Execution wrapper for facility searches.
 * @param {Object} args - Validated arguments from z.safeParse.
 * @returns {Array} List of facilities matching parameters.
 */
function execGetFacilityLocations(args) {
  return findFacilities(args.type, {
    accessible: args.accessible,
    nearZone: args.nearZone,
    limit: args.limit,
  });
}

/**
 * Execution wrapper for zone status queries.
 * @param {Object} args - Validated arguments from z.safeParse.
 * @returns {Object|Array} Selected zone details or list of all zones.
 */
function execGetZoneStatus(args) {
  const state = getState();
  if (args.zoneId) {
    const zone = state.crowd.zones.find((z) => z.id === args.zoneId);
    return zone || { error: 'Zone not found' };
  }
  return state.crowd.zones;
}

/**
 * Execution wrapper for transport queries.
 * @param {Object} args - Validated arguments.
 * @returns {Array} List of transport options matching parameters.
 */
function execGetTransportOptions(args) {
  const state = getState();
  return getTransportOptions(args, state.transport);
}

/**
 * Execution wrapper for retrieving the operations snapshot summary.
 * Projects only the metrics required for briefing, keeping payload sizes bounded.
 * @returns {Object} Compact operations snapshot details.
 */
function execGetCurrentOperationsSnapshot() {
  const state = getState();
  return {
    scenarioId: state.scenarioId,
    scenarioName: state.scenarioName,
    snapshotVersion: state.snapshotVersion,
    snapshotTimestamp: state.snapshotTimestamp,
    zones: state.crowd.zones.map((z) => ({
      id: z.id, name: z.name, occupancyPct: z.occupancyPct,
      densityLevel: z.densityLevel, queueMinutes: z.queueMinutes,
      accessibilityObstruction: z.accessibilityObstruction,
    })),
    activeIncidents: state.crowd.incidents.filter((i) => i.status !== 'resolved').length,
    elevatorOutages: state.elevatorOutages,
  };
}

/**
 * Execution wrapper for zone risk scoring.
 * @param {Object} args - Validated arguments.
 * @returns {Object} Zone risk report with factors.
 */
function execCalculateZoneRisk(args) {
  const state = getState();
  return calculateZoneRisk(args.zoneId, state.crowd, state.transport);
}

/**
 * Execution wrapper for retrieving incident response playbooks.
 * @param {Object} args - Validated arguments.
 * @returns {Object} Incident response playbook.
 */
function execGetIncidentPlaybook(args) {
  return getIncidentPlaybook(args.incidentType);
}

/**
 * Execution wrapper for volunteer availability.
 * @param {Object} args - Validated arguments.
 * @returns {Object} Volunteer availability details.
 */
function execGetVolunteerAvailability(args) {
  return getVolunteerAvailability(args.zone);
}

/**
 * Execution wrapper for comparing response options.
 * @param {Object} args - Validated arguments.
 * @returns {Array} Ordered response options with trade-offs.
 */
function execCompareResponseOptions(args) {
  const state = getState();
  return compareResponseOptions(args.incidentId, state.crowd);
}

// ─── Registry ─────────────────────────────────────────────────────────────

/**
 * Map connecting Gemini tool names to execution handlers and validation schemas.
 * @type {Record<string, { fn: Function, schema: z.ZodType<any> }>}
 */
export const TOOL_REGISTRY = {
  getVenueRoute: { fn: execGetVenueRoute, schema: venueRouteSchema },
  getAccessibleRoute: { fn: execGetAccessibleRoute, schema: accessibleRouteSchema },
  getFacilityLocations: { fn: execGetFacilityLocations, schema: facilitySchema },
  getZoneStatus: { fn: execGetZoneStatus, schema: zoneStatusSchema },
  getTransportOptions: { fn: execGetTransportOptions, schema: transportSchema },
  getCurrentOperationsSnapshot: { fn: execGetCurrentOperationsSnapshot, schema: emptySchema },
  calculateZoneRisk: { fn: execCalculateZoneRisk, schema: riskSchema },
  getIncidentPlaybook: { fn: execGetIncidentPlaybook, schema: playbookSchema },
  getVolunteerAvailability: { fn: execGetVolunteerAvailability, schema: volunteerSchema },
  compareResponseOptions: { fn: execCompareResponseOptions, schema: compareSchema },
};

/**
 * Allowlist containing all registered tool names.
 * Used for rapid lookups before argument validation.
 * @type {Set<string>}
 */
export const ALLOWED_TOOL_NAMES = new Set(Object.keys(TOOL_REGISTRY));

/**
 * Execute a tool by name with validated arguments.
 * Throws an Error if tool name is unknown or arguments fail validation.
 *
 * @description Serves as the central security perimeter for all Gemini function calling.
 *   Guards parameters against invalid types, out-of-bounds numbers, and unknown values.
 *
 * @param {string} name - Tool name.
 * @param {unknown} args - Raw arguments payload parsed from the Gemini response.
 * @returns {unknown} Serialisable output from the executed tool.
 * @throws {Error} If name is not registered or validation fails.
 *
 * @risk-area
 *   Any error thrown here is caught by the AI service calling loop and returned
 *   to Gemini as a function response block. Ensure error messages are clean and
 *   do not contain any stack traces or private path structures.
 */
export function executeTool(name, args) {
  const tool = TOOL_REGISTRY[name];
  // #Risk-Area — Check name against registry; unrecognized names must throw to avoid bypasses.
  if (!tool) {
    throw new Error(`Tool not allowed: ${name}`);
  }

  // #What — Validate raw arguments from Gemini against the Zod schema.
  const parsed = tool.schema.safeParse(args);
  if (!parsed.success) {
    throw new Error(`Invalid arguments for tool ${name}: ${parsed.error.message}`);
  }

  // #What — Execute deterministic handler using validated arguments.
  return tool.fn(parsed.data);
}
