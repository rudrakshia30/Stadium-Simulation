/**
 * Simulated crowd state factory for Unity Arena.
 * All data is fictional — for demonstration purposes only.
 *
 * @module data/crowd
 */

const SNAPSHOT_VERSION = 'v1.0.0';
const DATA_SOURCE = 'simulated';

/**
 * Returns the baseline (normal pre-match) crowd state.
 * @returns {{ zones: Array<Object>, incidents: Array<Object> }}
 */
export function getDefaultCrowdState() {
  const now = new Date().toISOString();

  return {
    zones: [
      {
        id: 'zone-north-concourse',
        name: 'North Concourse',
        occupancyPct: 42,
        densityLevel: 'moderate',
        queueMinutes: 5,
        movementDirection: 'inbound',
        accessibilityObstruction: false,
        lastUpdated: now,
        snapshotVersion: SNAPSHOT_VERSION,
        dataSource: DATA_SOURCE,
      },
      {
        id: 'zone-east-concourse',
        name: 'East Concourse',
        occupancyPct: 35,
        densityLevel: 'low',
        queueMinutes: 3,
        movementDirection: 'inbound',
        accessibilityObstruction: false,
        lastUpdated: now,
        snapshotVersion: SNAPSHOT_VERSION,
        dataSource: DATA_SOURCE,
      },
      {
        id: 'zone-south-concourse',
        name: 'South Concourse',
        occupancyPct: 30,
        densityLevel: 'low',
        queueMinutes: 2,
        movementDirection: 'inbound',
        accessibilityObstruction: false,
        lastUpdated: now,
        snapshotVersion: SNAPSHOT_VERSION,
        dataSource: DATA_SOURCE,
      },
      {
        id: 'zone-west-concourse',
        name: 'West Concourse',
        occupancyPct: 38,
        densityLevel: 'moderate',
        queueMinutes: 4,
        movementDirection: 'inbound',
        accessibilityObstruction: false,
        lastUpdated: now,
        snapshotVersion: SNAPSHOT_VERSION,
        dataSource: DATA_SOURCE,
      },
      {
        id: 'zone-accessible-hub',
        name: 'Accessible Hub',
        occupancyPct: 20,
        densityLevel: 'low',
        queueMinutes: 1,
        movementDirection: 'inbound',
        accessibilityObstruction: false,
        lastUpdated: now,
        snapshotVersion: SNAPSHOT_VERSION,
        dataSource: DATA_SOURCE,
      },
      {
        id: 'zone-gate-a-plaza',
        name: 'Gate A Plaza',
        occupancyPct: 55,
        densityLevel: 'moderate',
        queueMinutes: 8,
        movementDirection: 'inbound',
        accessibilityObstruction: false,
        lastUpdated: now,
        snapshotVersion: SNAPSHOT_VERSION,
        dataSource: DATA_SOURCE,
      },
      {
        id: 'zone-gate-b-plaza',
        name: 'Gate B Plaza',
        occupancyPct: 48,
        densityLevel: 'moderate',
        queueMinutes: 6,
        movementDirection: 'inbound',
        accessibilityObstruction: false,
        lastUpdated: now,
        snapshotVersion: SNAPSHOT_VERSION,
        dataSource: DATA_SOURCE,
      },
      {
        id: 'zone-gate-c-plaza',
        name: 'Gate C Plaza',
        occupancyPct: 32,
        densityLevel: 'low',
        queueMinutes: 3,
        movementDirection: 'inbound',
        accessibilityObstruction: false,
        lastUpdated: now,
        snapshotVersion: SNAPSHOT_VERSION,
        dataSource: DATA_SOURCE,
      },
      {
        id: 'zone-gate-d-plaza',
        name: 'Gate D Plaza',
        occupancyPct: 45,
        densityLevel: 'moderate',
        queueMinutes: 7,
        movementDirection: 'inbound',
        accessibilityObstruction: false,
        lastUpdated: now,
        snapshotVersion: SNAPSHOT_VERSION,
        dataSource: DATA_SOURCE,
      },
    ],
    incidents: [
      {
        id: 'inc-001',
        type: 'queue-congestion',
        severity: 'low',
        zone: 'zone-gate-a-plaza',
        status: 'investigating',
        description: 'Minor queue buildup at Gate A ticketing kiosk. Self-resolving as fans move through.',
        requiredRole: 'steward',
        humanVerified: false,
        timestamp: now,
      },
      {
        id: 'inc-002',
        type: 'accessibility',
        severity: 'low',
        zone: 'zone-north-concourse',
        status: 'active',
        description: 'Temporary merchandise stand partially obstructing the accessible corridor near Elevator (North). Volunteer redirecting fans.',
        requiredRole: 'accessibility-volunteer',
        humanVerified: true,
        timestamp: now,
      },
    ],
  };
}
