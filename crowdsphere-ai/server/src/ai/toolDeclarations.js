/**
 * Gemini function declarations for all 10 deterministic stadium tools.
 * These declarations expose the tools to Gemini via function calling.
 * Gemini cannot call any function not declared here.
 *
 * @module ai/toolDeclarations
 */

export const GEMINI_TOOL_DECLARATIONS = [
  {
    name: 'getVenueRoute',
    description: 'Calculate the shortest walking route between two locations in Unity Arena. Returns verified route with steps, distance, time, and crowd warnings.',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Source node ID (e.g., gate-a, zone-north-concourse, section-214)' },
        to: { type: 'string', description: 'Destination node ID' },
        preferences: {
          type: 'object',
          description: 'Route preferences',
          properties: {
            wheelchair: { type: 'boolean', description: 'Require wheelchair-accessible route' },
            stepFree: { type: 'boolean', description: 'Require step-free (no stairs) route' },
            avoidStairs: { type: 'boolean', description: 'Avoid stair edges where possible' },
            avoidCrowds: { type: 'boolean', description: 'Prefer less-crowded zones' },
            avoidLongWalking: { type: 'boolean', description: 'Prefer shorter distance routes' },
          },
        },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'getAccessibleRoute',
    description: 'Calculate a fully wheelchair-accessible and step-free route, automatically avoiding unavailable elevators. Use this when a fan has mobility requirements.',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Source node ID' },
        to: { type: 'string', description: 'Destination node ID' },
        preferences: {
          type: 'object',
          properties: {
            avoidCrowds: { type: 'boolean' },
            avoidLongWalking: { type: 'boolean' },
          },
        },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'getFacilityLocations',
    description: 'Find facilities in Unity Arena by type. Returns location, accessibility, and zone information.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Facility type: toilet, accessible_toilet, medical, water_refill, food, information, prayer_room, sensory_room, family_assistance, lost_found, volunteer_station, elevator, ramp, stairs, emergency_exit, recycling',
        },
        accessible: { type: 'boolean', description: 'Return only accessible facilities' },
        nearZone: { type: 'string', description: 'Prefer facilities near this zone ID' },
        limit: { type: 'number', description: 'Maximum results (1-20)' },
      },
      required: ['type'],
    },
  },
  {
    name: 'getZoneStatus',
    description: 'Get current crowd status for a zone or all zones. Returns occupancy, density level, queue time, and accessibility obstruction status.',
    parameters: {
      type: 'object',
      properties: {
        zoneId: { type: 'string', description: 'Zone ID to get status for (omit for all zones)' },
      },
    },
  },
  {
    name: 'getTransportOptions',
    description: 'Get available transport options from Unity Arena with current operational status.',
    parameters: {
      type: 'object',
      properties: {
        accessible: { type: 'boolean', description: 'Return only accessible transport' },
        type: {
          type: 'string',
          enum: ['metro', 'bus', 'shuttle', 'taxi', 'accessible_transport', 'bicycle'],
          description: 'Filter by transport type',
        },
      },
    },
  },
  {
    name: 'getCurrentOperationsSnapshot',
    description: 'Get a summary of the current operations state including all zone statuses, active incidents, and elevator outages.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'calculateZoneRisk',
    description: 'Calculate the deterministic risk score (0-100) for a specific zone with contributing factors breakdown.',
    parameters: {
      type: 'object',
      properties: {
        zoneId: { type: 'string', description: 'Zone ID to calculate risk for' },
      },
      required: ['zoneId'],
    },
  },
  {
    name: 'getIncidentPlaybook',
    description: 'Get the step-by-step response playbook for an incident type.',
    parameters: {
      type: 'object',
      properties: {
        incidentType: {
          type: 'string',
          description: 'Incident type: crowd-surge, medical, fire, lost-child, elevator-failure, security, weather, power-outage, volunteer-shortage, movement-conflict, transport-disruption, queue-congestion',
        },
      },
      required: ['incidentType'],
    },
  },
  {
    name: 'getVolunteerAvailability',
    description: 'Get current volunteer coverage and shortage status, optionally filtered by zone.',
    parameters: {
      type: 'object',
      properties: {
        zone: { type: 'string', description: 'Zone ID to check (omit for all zones)' },
      },
    },
  },
  {
    name: 'compareResponseOptions',
    description: 'Get a comparison of available response options for an active incident, with trade-offs.',
    parameters: {
      type: 'object',
      properties: {
        incidentId: { type: 'string', description: 'Active incident ID to compare responses for' },
      },
      required: ['incidentId'],
    },
  },
];
