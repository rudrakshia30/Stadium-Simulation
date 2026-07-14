/**
 * Tool registry — maps Gemini function names to deterministic implementations.
 * All tools are validated with Zod before execution.
 * Gemini cannot invoke any function not in this registry.
 *
 * @module tools/index
 */

import { z } from 'zod';
import { calculateRoute } from './routingEngine.js';
import { calculateZoneRisk, calculateOverallRisk } from './riskEngine.js';
import { findFacilities } from './facilityFinder.js';
import { getTransportOptions } from './transportAdvisor.js';
import { getVolunteerAvailability } from './volunteerTracker.js';
import { getIncidentPlaybook } from './incidentPlaybook.js';
import { compareResponseOptions } from './responseComparator.js';
import { getState } from '../data/operationsState.js';
import venue from '../data/venue.js';

// ─── Input schemas ────────────────────────────────────────────────────────

const VALID_NODES = new Set(venue.graph.nodes);

const nodeIdSchema = z.string().min(1).max(100).refine((v) => VALID_NODES.has(v), {
  message: 'Unknown venue node ID',
});

const preferencesSchema = z.object({
  wheelchair: z.boolean().optional().default(false),
  stepFree: z.boolean().optional().default(false),
  avoidStairs: z.boolean().optional().default(false),
  avoidCrowds: z.boolean().optional().default(false),
  avoidLongWalking: z.boolean().optional().default(false),
}).optional().default({});

const venueRouteSchema = z.object({
  from: nodeIdSchema,
  to: nodeIdSchema,
  preferences: preferencesSchema,
});

const accessibleRouteSchema = z.object({
  from: nodeIdSchema,
  to: nodeIdSchema,
  preferences: preferencesSchema,
});

const facilitySchema = z.object({
  type: z.string().min(1).max(50),
  accessible: z.boolean().optional(),
  nearZone: z.string().optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

const zoneStatusSchema = z.object({
  zoneId: z.string().min(1).max(100).optional(),
});

const transportSchema = z.object({
  accessible: z.boolean().optional(),
  type: z.enum(['metro', 'bus', 'shuttle', 'taxi', 'accessible_transport', 'bicycle']).optional(),
});

const emptySchema = z.object({}).optional().default({});

const riskSchema = z.object({
  zoneId: z.string().min(1).max(100),
});

const playbookSchema = z.object({
  incidentType: z.string().min(1).max(100),
});

const volunteerSchema = z.object({
  zone: z.string().optional(),
});

const compareSchema = z.object({
  incidentId: z.string().min(1).max(100),
});

// ─── Tool implementations ─────────────────────────────────────────────────

function execGetVenueRoute(args) {
  const state = getState();
  return calculateRoute(
    { from: args.from, to: args.to, ...args.preferences },
    state.crowd,
  );
}

function execGetAccessibleRoute(args) {
  const state = getState();
  const prefs = { ...args.preferences, wheelchair: true, stepFree: true };
  return calculateRoute(
    { from: args.from, to: args.to, ...prefs, elevatorOutages: state.elevatorOutages },
    state.crowd,
  );
}

function execGetFacilityLocations(args) {
  return findFacilities(args.type, {
    accessible: args.accessible,
    nearZone: args.nearZone,
    limit: args.limit,
  });
}

function execGetZoneStatus(args) {
  const state = getState();
  if (args.zoneId) {
    const zone = state.crowd.zones.find((z) => z.id === args.zoneId);
    return zone || { error: 'Zone not found' };
  }
  return state.crowd.zones;
}

function execGetTransportOptions(args) {
  const state = getState();
  return getTransportOptions(args, state.transport);
}

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

function execCalculateZoneRisk(args) {
  const state = getState();
  return calculateZoneRisk(args.zoneId, state.crowd, state.transport);
}

function execGetIncidentPlaybook(args) {
  return getIncidentPlaybook(args.incidentType);
}

function execGetVolunteerAvailability(args) {
  return getVolunteerAvailability(args.zone);
}

function execCompareResponseOptions(args) {
  const state = getState();
  return compareResponseOptions(args.incidentId, state.crowd);
}

// ─── Registry ─────────────────────────────────────────────────────────────

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

export const ALLOWED_TOOL_NAMES = new Set(Object.keys(TOOL_REGISTRY));

/**
 * Execute a tool by name with validated arguments.
 * Throws ValidationError if tool name is unknown or args invalid.
 *
 * @param {string} name - Tool name
 * @param {unknown} args - Raw arguments from Gemini
 * @returns {unknown} Tool result
 */
export function executeTool(name, args) {
  const tool = TOOL_REGISTRY[name];
  if (!tool) {
    throw new Error(`Tool not allowed: ${name}`);
  }

  const parsed = tool.schema.safeParse(args);
  if (!parsed.success) {
    throw new Error(`Invalid arguments for tool ${name}: ${parsed.error.message}`);
  }

  return tool.fn(parsed.data);
}
