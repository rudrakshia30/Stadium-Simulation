/**
 * In-memory operations state singleton.
 * Manages the currently active simulation scenario and its derived state.
 * No real database — all data is simulated.
 *
 * @module data/operationsState
 */

import { getDefaultCrowdState } from './crowd.js';
import { getDefaultTransportState } from './transport.js';
import { getScenarioById } from './scenarios.js';

/** @type {{ scenarioId: string, crowd: Object, transport: Array, elevatorOutages: string[], closedEdges: Array }} */
let state = null;

function buildState(scenario) {
  const base = getDefaultCrowdState();
  const baseTrans = getDefaultTransportState();

  // Apply crowd zone overrides
  const zones = base.zones.map((zone) => {
    const override = scenario.crowdOverrides[zone.id];
    if (override) {
      return { ...zone, ...override, lastUpdated: new Date().toISOString() };
    }
    return zone;
  });

  // Merge incident overrides (add to existing)
  const incidents = [...base.incidents, ...scenario.incidentOverrides];

  // Apply transport overrides
  const transport = baseTrans.map((t) => {
    const override = scenario.transportOverrides[t.id];
    if (override) {
      return { ...t, ...override, lastUpdated: new Date().toISOString() };
    }
    return t;
  });

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    scenarioDescription: scenario.description,
    crowd: { zones, incidents },
    transport,
    elevatorOutages: scenario.elevatorOutages || [],
    closedEdges: scenario.closedEdges || [],
    snapshotVersion: `${scenario.id}-${Date.now()}`,
    snapshotTimestamp: new Date().toISOString(),
  };
}

/**
 * Get current operations state.
 * Lazily initialises with the 'normal-entry' scenario.
 * @returns {Object}
 */
export function getState() {
  if (!state) {
    const scenario = getScenarioById('normal-entry');
    state = buildState(scenario);
  }
  return state;
}

/**
 * Apply a scenario by ID, replacing the current state.
 * @param {string} scenarioId
 * @returns {Object} New state
 */
export function setState(scenarioId) {
  const scenario = getScenarioById(scenarioId);
  if (!scenario) {
    throw new Error(`Unknown scenario: ${scenarioId}`);
  }
  state = buildState(scenario);
  return state;
}

/**
 * Reset state to the default baseline scenario.
 * @returns {Object} Reset state
 */
export function resetState() {
  return setState('normal-entry');
}
