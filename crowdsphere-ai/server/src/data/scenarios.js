/**
 * Simulation scenarios for Unity Arena.
 * Each scenario defines crowd, incident, transport, and infrastructure overrides.
 * All data is simulated for demonstration purposes.
 *
 * @module data/scenarios
 */

const now = () => new Date().toISOString();

/** @type {Array<import('../types.js').Scenario>} */
export const scenarios = [
  {
    id: 'normal-entry',
    name: 'Normal Match Entry',
    description: 'Standard pre-match crowd flow. All systems operational. Minor queue at Gate A.',
    crowdOverrides: {},
    incidentOverrides: [],
    transportOverrides: {},
    elevatorOutages: [],
    closedEdges: [],
  },
  {
    id: 'gate-d-surge',
    name: 'Sudden Crowd Surge at Gate D',
    description: 'Unexpected surge of fans arriving simultaneously at Gate D. Critical occupancy. Volunteer deployment required.',
    crowdOverrides: {
      'zone-gate-d-plaza': { occupancyPct: 95, densityLevel: 'critical', queueMinutes: 25, movementDirection: 'conflicted', accessibilityObstruction: true },
      'zone-west-concourse': { occupancyPct: 78, densityLevel: 'high', queueMinutes: 15, movementDirection: 'inbound' },
    },
    incidentOverrides: [
      {
        id: 'inc-gate-d-surge',
        type: 'crowd-surge',
        severity: 'critical',
        zone: 'zone-gate-d-plaza',
        status: 'active',
        description: 'Critical crowd density at Gate D plaza. Fan movement conflicted. Immediate volunteer deployment required.',
        requiredRole: 'crowd-manager',
        humanVerified: false,
        timestamp: now(),
      },
    ],
    transportOverrides: {},
    elevatorOutages: [],
    closedEdges: [],
  },
  {
    id: 'medical-incident-214',
    name: 'Medical Incident near Section 214',
    description: 'Fan requires medical assistance near Section 214 in the upper south block. Medical team and clear route required.',
    crowdOverrides: {
      'zone-south-concourse': { occupancyPct: 55, densityLevel: 'high', queueMinutes: 8 },
    },
    incidentOverrides: [
      {
        id: 'inc-medical-214',
        type: 'medical',
        severity: 'high',
        zone: 'zone-south-concourse',
        status: 'active',
        description: 'Fan requires urgent medical assistance near Section 214 concourse level. Area partially cordoned. Medical team en route.',
        requiredRole: 'medical-team',
        humanVerified: true,
        timestamp: now(),
      },
    ],
    transportOverrides: {},
    elevatorOutages: [],
    closedEdges: [],
  },
  {
    id: 'elevator-unavailable',
    name: 'Accessible Elevator Unavailable',
    description: 'The North elevator serving the accessible hub has gone out of service. Alternative accessible routes must be identified. Affects access to Sections 214 and 215.',
    crowdOverrides: {
      'zone-accessible-hub': { occupancyPct: 35, densityLevel: 'moderate', accessibilityObstruction: true },
    },
    incidentOverrides: [
      {
        id: 'inc-elevator-n',
        type: 'elevator-failure',
        severity: 'high',
        zone: 'zone-north-concourse',
        status: 'active',
        description: 'Elevator (North) is out of service. Wheelchair users and mobility-impaired fans unable to access upper levels via this route. Alternative routes via Ramp (North) and East Concourse elevator available.',
        requiredRole: 'accessibility-volunteer',
        humanVerified: true,
        timestamp: now(),
      },
    ],
    transportOverrides: {},
    elevatorOutages: ['elevator-n'],
    closedEdges: [],
  },
  {
    id: 'metro-disruption',
    name: 'Metro Service Disruption',
    description: 'Metro service from Unity Square station suspended due to a track issue. Bus and shuttle alternatives are available. Increased demand expected at remaining transport points.',
    crowdOverrides: {
      'zone-north-concourse': { occupancyPct: 62, densityLevel: 'high', queueMinutes: 12 },
    },
    incidentOverrides: [
      {
        id: 'inc-metro-disruption',
        type: 'transport-disruption',
        severity: 'high',
        zone: 'zone-north-concourse',
        status: 'active',
        description: 'Metro service suspended. Fans redirected to bus terminal (south exit) and shuttle pickup (east exit). Estimated restoration: 45 minutes.',
        requiredRole: 'transport-coordinator',
        humanVerified: true,
        timestamp: now(),
      },
    ],
    transportOverrides: {
      'metro-main': { status: 'disrupted', notes: 'Service suspended due to track fault. Estimated restoration in 45 minutes. Use Bus Terminal or Shuttle Pickup.' },
    },
    elevatorOutages: [],
    closedEdges: [],
  },
  {
    id: 'post-match-exit',
    name: 'Post-Match Mass Exit',
    description: 'Final whistle has blown. All zones experiencing high to critical occupancy as 60,000 fans attempt to leave simultaneously. All gate queues extended.',
    crowdOverrides: {
      'zone-north-concourse': { occupancyPct: 88, densityLevel: 'critical', queueMinutes: 22, movementDirection: 'outbound' },
      'zone-east-concourse': { occupancyPct: 82, densityLevel: 'critical', queueMinutes: 18, movementDirection: 'outbound' },
      'zone-south-concourse': { occupancyPct: 85, densityLevel: 'critical', queueMinutes: 20, movementDirection: 'outbound' },
      'zone-west-concourse': { occupancyPct: 80, densityLevel: 'high', queueMinutes: 16, movementDirection: 'outbound' },
      'zone-gate-a-plaza': { occupancyPct: 92, densityLevel: 'critical', queueMinutes: 28 },
      'zone-gate-b-plaza': { occupancyPct: 87, densityLevel: 'critical', queueMinutes: 24 },
      'zone-gate-c-plaza': { occupancyPct: 79, densityLevel: 'high', queueMinutes: 18 },
      'zone-gate-d-plaza': { occupancyPct: 83, densityLevel: 'critical', queueMinutes: 21 },
    },
    incidentOverrides: [
      {
        id: 'inc-mass-exit',
        type: 'crowd-surge',
        severity: 'high',
        zone: 'zone-north-concourse',
        status: 'active',
        description: 'Post-match mass exit underway. All exits active. Recommend staggered exit guidance via PA system.',
        requiredRole: 'operations-manager',
        humanVerified: true,
        timestamp: now(),
      },
    ],
    transportOverrides: {},
    elevatorOutages: [],
    closedEdges: [],
  },
  {
    id: 'heavy-rain',
    name: 'Heavy Rain and Slippery Concourse',
    description: 'Unexpected heavy rain has caused slippery outdoor concourse areas. Some outdoor routes have reduced safe capacity. Slip-hazard warnings required.',
    crowdOverrides: {
      'zone-gate-a-plaza': { occupancyPct: 60, densityLevel: 'high', queueMinutes: 14, accessibilityObstruction: true },
      'zone-gate-c-plaza': { occupancyPct: 55, densityLevel: 'moderate', queueMinutes: 10 },
    },
    incidentOverrides: [
      {
        id: 'inc-rain-hazard',
        type: 'weather',
        severity: 'moderate',
        zone: 'zone-gate-a-plaza',
        status: 'active',
        description: 'Heavy rain has created slip hazards on outdoor concourse surfaces. North plaza and south plaza marked as caution zones. Cleaning teams deployed.',
        requiredRole: 'safety-steward',
        humanVerified: false,
        timestamp: now(),
      },
    ],
    transportOverrides: {},
    elevatorOutages: [],
    closedEdges: [],
  },
  {
    id: 'lost-child',
    name: 'Lost Child Report',
    description: 'A child has been reported lost near the North Concourse food court. Family assistance team activated. Fan PA announcement recommended.',
    crowdOverrides: {},
    incidentOverrides: [
      {
        id: 'inc-lost-child',
        type: 'lost-child',
        severity: 'high',
        zone: 'zone-north-concourse',
        status: 'active',
        description: 'Child reported separated from family near Food Court (North). Child is safe with a steward at the Family Assistance Desk. Parent/guardian announcement required.',
        requiredRole: 'family-assistance',
        humanVerified: true,
        timestamp: now(),
      },
    ],
    transportOverrides: {},
    elevatorOutages: [],
    closedEdges: [],
  },
  {
    id: 'volunteer-shortage',
    name: 'Volunteer Shortage',
    description: 'Multiple volunteer teams have reported sick. Current volunteer coverage is below minimum threshold for safe operations in two zones.',
    crowdOverrides: {
      'zone-east-concourse': { occupancyPct: 48, densityLevel: 'moderate', queueMinutes: 9 },
      'zone-south-concourse': { occupancyPct: 45, densityLevel: 'moderate', queueMinutes: 8 },
    },
    incidentOverrides: [
      {
        id: 'inc-volunteer-shortage',
        type: 'volunteer-shortage',
        severity: 'moderate',
        zone: 'zone-east-concourse',
        status: 'active',
        description: 'East and South concourse volunteer coverage below minimum (3 of 5 positions filled). Redeployment from low-risk areas recommended.',
        requiredRole: 'volunteer-coordinator',
        humanVerified: false,
        timestamp: now(),
      },
    ],
    transportOverrides: {},
    elevatorOutages: [],
    closedEdges: [],
  },
  {
    id: 'movement-conflict',
    name: 'Conflicting Movement near North Concourse',
    description: 'Inbound and outbound fan movement is conflicting in the North Concourse corridor, creating a pinch point. Temporary one-way system activation may be required.',
    crowdOverrides: {
      'zone-north-concourse': { occupancyPct: 72, densityLevel: 'high', queueMinutes: 14, movementDirection: 'conflicted', accessibilityObstruction: true },
    },
    incidentOverrides: [
      {
        id: 'inc-movement-conflict',
        type: 'movement-conflict',
        severity: 'high',
        zone: 'zone-north-concourse',
        status: 'active',
        description: 'Bidirectional crowd movement creating pressure point in North Concourse central corridor. One-way system activation requires operations manager approval.',
        requiredRole: 'crowd-manager',
        humanVerified: false,
        timestamp: now(),
      },
    ],
    transportOverrides: {},
    elevatorOutages: [],
    closedEdges: [],
  },
];

/**
 * Get a scenario by ID.
 * @param {string} id
 * @returns {import('../types.js').Scenario | undefined}
 */
export function getScenarioById(id) {
  return scenarios.find((s) => s.id === id);
}
