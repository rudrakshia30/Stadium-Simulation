/**
 * Incident response playbooks for Unity Arena.
 * Returns step-by-step response procedures for incident types.
 *
 * @module tools/incidentPlaybook
 */

/** @type {Record<string, Object>} */
const PLAYBOOKS = {
  'crowd-surge': {
    type: 'crowd-surge',
    steps: [
      'Immediately alert the Operations Manager and Senior Steward.',
      'Deploy available volunteers to create a safety perimeter.',
      'Activate one-way crowd flow in affected corridor.',
      'Broadcast a calm reassurance message via PA system (requires approval).',
      'Open additional exit routes if available.',
      'Monitor every 2 minutes and report to operations.',
      'Do not attempt to physically restrain crowd movement.',
    ],
    requiredRoles: ['operations-manager', 'crowd-manager', 'steward'],
    estimatedMinutes: 15,
    escalationPath: 'If conditions worsen: contact venue security commander and consider venue-wide PA.',
  },
  medical: {
    type: 'medical',
    steps: [
      'Dispatch medical team to reported location immediately.',
      'Clear a 3-metre radius around the patient.',
      'Assign a steward to guide medical team through shortest clear route.',
      'Do not move the patient unless life-threatening hazard is present.',
      'Keep bystanders calm — do not announce medical emergency on PA.',
      'Document incident time, location, and response.',
    ],
    requiredRoles: ['medical-team', 'steward'],
    estimatedMinutes: 8,
    escalationPath: 'If patient requires hospital: coordinate with venue security for ambulance access route.',
  },
  fire: {
    type: 'fire',
    steps: [
      'Trigger fire alarm immediately if not already active.',
      'Notify venue security and emergency services immediately.',
      'Begin evacuation of nearest sections using assigned exit routes.',
      'Accessibility volunteers to assist mobility-impaired fans.',
      'Do not use elevators during evacuation.',
      'Stewards to sweep sections and confirm clearance.',
      'Report to assembly points and conduct headcount.',
    ],
    requiredRoles: ['fire-warden', 'security', 'accessibility-volunteer'],
    estimatedMinutes: 5,
    escalationPath: 'Full venue evacuation: contact venue commander. PA system requires immediate activation.',
  },
  'lost-child': {
    type: 'lost-child',
    steps: [
      'Bring child to the nearest Family Assistance Desk immediately.',
      'Record child description and last known location (no personal data stored).',
      'Alert Family Assistance team across all desks.',
      'Prepare a PA announcement with safe description (requires management approval).',
      'Check CCTV via venue security for last known parent location.',
      'Reunite child with parent/guardian at Family Assistance Desk.',
    ],
    requiredRoles: ['family-assistance', 'steward'],
    estimatedMinutes: 10,
    escalationPath: 'If unresolved after 20 minutes: notify venue security commander and contact local police.',
  },
  'elevator-failure': {
    type: 'elevator-failure',
    steps: [
      'Mark elevator as out of service and restrict access.',
      'Notify accessibility volunteers immediately.',
      'Identify and activate alternative accessible route (ramp or second elevator).',
      'Station a volunteer at the elevator to redirect fans.',
      'Update operations snapshot with elevator outage status.',
      'Notify transport coordination for accessible vehicle adjustments.',
      'Arrange manual assistance for fans in transit if needed.',
    ],
    requiredRoles: ['accessibility-volunteer', 'maintenance-technician'],
    estimatedMinutes: 12,
    escalationPath: 'If no alternative accessible route exists: contact operations manager for immediate volunteer deployment.',
  },
  security: {
    type: 'security',
    steps: [
      'Notify security team immediately with location and description.',
      'Do not approach or confront individuals.',
      'Maintain observation distance and continue monitoring.',
      'Clear immediate area of bystanders calmly.',
      'Document incident with time and location.',
      'Provide full report to security team on arrival.',
    ],
    requiredRoles: ['security', 'steward'],
    estimatedMinutes: 10,
    escalationPath: 'If situation is dangerous: call venue emergency line and await police.',
  },
  weather: {
    type: 'weather',
    steps: [
      'Identify and mark affected outdoor areas immediately.',
      'Deploy cleaning team with wet-floor signage.',
      'Redirect fans to covered concourse routes.',
      'Assess impact on accessible routes — check for obstruction.',
      'Increase volunteer presence on outdoor concourses.',
      'Broadcast weather safety guidance via PA (requires approval).',
    ],
    requiredRoles: ['safety-steward', 'cleaning-team'],
    estimatedMinutes: 20,
    escalationPath: 'If conditions worsen significantly: consult operations manager on temporary access restrictions.',
  },
  'power-outage': {
    type: 'power-outage',
    steps: [
      'Ensure emergency lighting is active.',
      'Alert all zone stewards immediately.',
      'Pause any PA or digital signage reliant on mains power.',
      'Check on fans in elevators — dispatch technician.',
      'Switch to battery-powered communication devices.',
      'Maintain calm — do not announce power failure on PA initially.',
      'Notify venue technical team and await instructions.',
    ],
    requiredRoles: ['technical-team', 'steward', 'security'],
    estimatedMinutes: 30,
    escalationPath: 'If power not restored in 15 minutes: consider partial evacuation of enclosed zones.',
  },
  'volunteer-shortage': {
    type: 'volunteer-shortage',
    steps: [
      'Identify zones with coverage below minimum threshold.',
      'Redeploy volunteers from low-risk zones to high-risk zones.',
      'Contact volunteer coordinator for emergency reinforcement.',
      'Brief redeployed volunteers on new zone protocols.',
      'Adjust zone occupancy limits to match reduced coverage.',
      'Document shortage for post-event review.',
    ],
    requiredRoles: ['volunteer-coordinator', 'operations-manager'],
    estimatedMinutes: 15,
    escalationPath: 'If coverage remains critical: request support from contracted security firm.',
  },
  'movement-conflict': {
    type: 'movement-conflict',
    steps: [
      'Alert Operations Manager immediately.',
      'Identify conflicting flow directions and pinch points.',
      'Station volunteers at both ends of the conflict zone.',
      'Introduce temporary one-way signage (requires operations approval).',
      'Redirect outbound fans to alternative exit corridor.',
      'Broadcast calm directional guidance via PA (requires approval).',
      'Monitor every 3 minutes until flows are separated.',
    ],
    requiredRoles: ['crowd-manager', 'steward'],
    estimatedMinutes: 10,
    escalationPath: 'If conflict cannot be resolved: contact operations manager for zone closure decision.',
  },
  'transport-disruption': {
    type: 'transport-disruption',
    steps: [
      'Confirm disruption with transport coordinator.',
      'Identify operational alternative services.',
      'Update digital wayfinding signs with alternative routes.',
      'Brief Information Desk staff on alternatives.',
      'Broadcast transport update via PA (requires approval).',
      'Increase volunteer presence at affected transport pickup points.',
      'Monitor alternative service capacity every 10 minutes.',
    ],
    requiredRoles: ['transport-coordinator', 'steward'],
    estimatedMinutes: 20,
    escalationPath: 'If multiple services disrupted: notify operations manager and consider emergency bus requisition.',
  },
  'queue-congestion': {
    type: 'queue-congestion',
    steps: [
      'Deploy additional volunteers to manage queue.',
      'Identify and activate additional gate entry lanes if possible.',
      'Broadcast message guiding fans to less-congested gates.',
      'Monitor queue time every 5 minutes.',
      'If queue time exceeds 30 minutes, escalate to operations manager.',
    ],
    requiredRoles: ['steward', 'crowd-manager'],
    estimatedMinutes: 10,
    escalationPath: 'If queue remains critical: request operations manager to authorise queue management barriers.',
  },
};

/**
 * Get the response playbook for an incident type.
 *
 * @param {string} incidentType
 * @returns {Object} Playbook with steps, roles, and escalation path
 */
export function getIncidentPlaybook(incidentType) {
  const playbook = PLAYBOOKS[incidentType];
  if (!playbook) {
    return {
      type: incidentType,
      steps: ['Assess the situation and contact the Operations Manager immediately.', 'Follow general emergency procedures.'],
      requiredRoles: ['operations-manager'],
      estimatedMinutes: 10,
      escalationPath: 'Contact venue security commander.',
      note: 'No specific playbook found for this incident type. General procedures applied.',
    };
  }
  return { ...playbook };
}
