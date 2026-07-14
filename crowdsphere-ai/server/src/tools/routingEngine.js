/**
 * Deterministic routing engine for Unity Arena.
 * Implements Dijkstra's shortest-path algorithm with crowd-awareness
 * and accessibility filtering.
 *
 * Gemini never runs this algorithm. Gemini may request a route via
 * function calling, but the route is always calculated here.
 *
 * @module tools/routingEngine
 */

import { randomUUID } from 'crypto';
import { PriorityQueue } from './priorityQueue.js';
import venue from '../data/venue.js';
import { NotFoundError } from '../utils/errors.js';

/** Walking speed in metres per minute */
const WALK_SPEED_MPM = 80;

/** Crowd density cost multipliers */
const DENSITY_MULTIPLIERS = {
  low: 1.0,
  moderate: 1.3,
  high: 1.8,
  critical: 2.5,
};

/** Penalty per minute of queue time added to edge cost */
const QUEUE_PENALTY_PER_MINUTE = 60;

/** Large stair penalty when avoidStairs is true but stairs not completely excluded */
const STAIR_AVOIDANCE_PENALTY = 500;

/**
 * Build an adjacency map from the venue graph edges (bidirectional).
 * @returns {Map<string, Array<Object>>}
 */
function buildAdjacency() {
  const adj = new Map();
  for (const node of venue.graph.nodes) {
    adj.set(node, []);
  }
  for (const edge of venue.graph.edges) {
    adj.get(edge.from)?.push({ ...edge, neighbor: edge.to });
    adj.get(edge.to)?.push({ ...edge, neighbor: edge.from });
  }
  return adj;
}

const ADJACENCY = buildAdjacency();

/**
 * Get crowd density for a node from the crowd state zone map.
 * @param {string} nodeId
 * @param {Map<string, Object>} zoneMap
 * @returns {{ densityLevel: string, queueMinutes: number }}
 */
function getNodeCrowd(nodeId, zoneMap) {
  const zone = zoneMap.get(nodeId);
  if (zone) return { densityLevel: zone.densityLevel, queueMinutes: zone.queueMinutes };
  return { densityLevel: 'low', queueMinutes: 0 };
}

/**
 * Check if an edge should be excluded based on accessibility options.
 * @param {Object} edge
 * @param {Object} opts
 * @returns {boolean} true if edge should be excluded
 */
function isEdgeExcluded(edge, opts) {
  // Wheelchair requires accessible edges only
  if (opts.wheelchair && !edge.accessible) return true;
  // Step-free requires step-free edges only
  if (opts.stepFree && !edge.stepFree) return true;
  // Elevator outage — exclude edges that require this elevator
  if (opts.elevatorOutages?.length && edge.requiresElevator) {
    // Exclude any elevator edge when there are known outages affecting this route
    return true;
  }
  // Closed edges — check pair
  if (opts.closedEdges?.length) {
    for (const [a, b] of opts.closedEdges) {
      if ((edge.from === a && edge.to === b) || (edge.from === b && edge.to === a)) return true;
    }
  }
  return false;
}

/**
 * Calculate the cost of traversing an edge.
 * @param {Object} edge
 * @param {Object} opts
 * @param {Map<string, Object>} zoneMap
 * @returns {number}
 */
function edgeCost(edge, opts, zoneMap) {
  const { densityLevel, queueMinutes } = getNodeCrowd(edge.to, zoneMap);
  const crowdMult = opts.avoidCrowds
    ? (DENSITY_MULTIPLIERS[densityLevel] || 1.0) * 1.5
    : (DENSITY_MULTIPLIERS[densityLevel] || 1.0);

  let cost = edge.distance * crowdMult;

  // Queue penalty at destination zone
  cost += queueMinutes * QUEUE_PENALTY_PER_MINUTE;

  // Stair avoidance penalty
  if (opts.avoidStairs && edge.requiresStairs) {
    cost += STAIR_AVOIDANCE_PENALTY;
  }

  // Long-walking avoidance — slight distance multiplier
  if (opts.avoidLongWalking) {
    cost *= 1.1;
  }

  return cost;
}

/**
 * Run Dijkstra's algorithm on the Unity Arena graph.
 *
 * @param {Object} options
 * @param {string} options.from - Source node ID
 * @param {string} options.to - Destination node ID
 * @param {boolean} [options.wheelchair] - Require wheelchair-accessible route
 * @param {boolean} [options.stepFree] - Require step-free route
 * @param {boolean} [options.avoidStairs] - Penalise stair edges
 * @param {boolean} [options.avoidCrowds] - Prefer low-density zones
 * @param {boolean} [options.avoidLongWalking] - Prefer shorter distances
 * @param {string[]} [options.elevatorOutages] - Elevator IDs offline
 * @param {Array<[string,string]>} [options.closedEdges] - Edge pairs to exclude
 * @param {{ zones: Array<Object> }} [crowdState] - Current crowd state
 * @returns {import('../types.js').RouteResult}
 * @throws {NotFoundError} if no route exists
 */
export function calculateRoute(options, crowdState) {
  const { from, to } = options;

  // Validate nodes exist
  if (!ADJACENCY.has(from)) throw new NotFoundError(`Unknown start node: ${from}`);
  if (!ADJACENCY.has(to)) throw new NotFoundError(`Unknown destination node: ${to}`);

  // Build zone lookup map
  const zoneMap = new Map();
  if (crowdState?.zones) {
    for (const zone of crowdState.zones) {
      zoneMap.set(zone.id, zone);
    }
  }

  // Dijkstra
  const dist = new Map();
  const prev = new Map();
  const prevEdge = new Map();
  const pq = new PriorityQueue();

  for (const node of ADJACENCY.keys()) {
    dist.set(node, Infinity);
  }
  dist.set(from, 0);
  pq.push(from, 0);

  while (!pq.isEmpty()) {
    const current = pq.pop();
    if (current === to) break;

    const currentDist = dist.get(current);
    const neighbors = ADJACENCY.get(current) || [];

    for (const edge of neighbors) {
      if (isEdgeExcluded(edge, options)) continue;

      const cost = edgeCost(edge, options, zoneMap);
      const newDist = currentDist + cost;

      if (newDist < dist.get(edge.neighbor)) {
        dist.set(edge.neighbor, newDist);
        prev.set(edge.neighbor, current);
        prevEdge.set(edge.neighbor, edge);
        pq.push(edge.neighbor, newDist);
      }
    }
  }

  // Check reachability
  if (dist.get(to) === Infinity) {
    throw new NotFoundError(
      `No accessible route found from ${from} to ${to} with the selected preferences. Please try different accessibility options or speak to a venue staff member.`,
    );
  }

  // Reconstruct path
  const nodes = [];
  let cur = to;
  while (cur) {
    nodes.unshift(cur);
    cur = prev.get(cur);
  }

  // Build steps
  const steps = [];
  let totalDistance = 0;
  const avoidedZones = [];
  const warnings = [];

  for (let i = 0; i < nodes.length - 1; i++) {
    const edgeKey = nodes[i + 1];
    const edge = prevEdge.get(edgeKey);
    if (!edge) continue;

    totalDistance += edge.distance;

    // Detect crowd warnings
    const zoneCrowd = getNodeCrowd(nodes[i + 1], zoneMap);
    if (zoneCrowd.densityLevel === 'high' || zoneCrowd.densityLevel === 'critical') {
      const zoneName = nodes[i + 1].replace(/-/g, ' ');
      warnings.push(`Area ahead (${zoneName}) is ${zoneCrowd.densityLevel} density. Allow extra time.`);
      avoidedZones.push(nodes[i + 1]);
    }

    steps.push({
      from: nodes[i],
      to: nodes[i + 1],
      description: describeStep(nodes[i], nodes[i + 1], edge),
      type: edge.type,
      distanceMeters: edge.distance,
    });
  }

  // Check elevator outage warning
  if (options.elevatorOutages?.length) {
    warnings.push('One or more elevators are currently out of service. This route avoids affected elevators.');
  }

  // Determine accessibility status
  let accessibilityStatus = 'fully-accessible';
  const hasStairEdge = steps.some((s) => s.type === 'stairs');
  const hasElevatorEdge = steps.some((s) => s.type === 'elevator');
  if (hasStairEdge) accessibilityStatus = 'not-accessible';
  else if (hasElevatorEdge && options.elevatorOutages?.length) accessibilityStatus = 'partially-accessible';

  const snapshotVersion = crowdState?.zones?.[0]?.snapshotVersion || 'unknown';

  return {
    routeId: randomUUID(),
    nodes,
    steps,
    distanceMeters: totalDistance,
    estimatedMinutes: Math.ceil(totalDistance / WALK_SPEED_MPM),
    accessibilityStatus,
    avoidedZones: [...new Set(avoidedZones)],
    warnings,
    verified: true,
    snapshotVersion,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate a human-readable step description.
 * @param {string} from
 * @param {string} to
 * @param {Object} edge
 * @returns {string}
 */
function describeStep(from, to, edge) {
  const fromLabel = formatNodeLabel(from);
  const toLabel = formatNodeLabel(to);

  if (edge.type === 'stairs') return `Take the stairs from ${fromLabel} to ${toLabel} (${edge.distance}m)`;
  if (edge.type === 'elevator') return `Take the elevator from ${fromLabel} to ${toLabel}`;
  if (edge.type === 'ramp') return `Follow the ramp from ${fromLabel} to ${toLabel} (${edge.distance}m)`;
  if (edge.type === 'external') return `Exit the venue and proceed to ${toLabel} (approximately ${edge.distance}m)`;
  return `Walk from ${fromLabel} to ${toLabel} (${edge.distance}m)`;
}

/**
 * Convert a node ID to a readable label.
 * @param {string} id
 * @returns {string}
 */
function formatNodeLabel(id) {
  return id
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
