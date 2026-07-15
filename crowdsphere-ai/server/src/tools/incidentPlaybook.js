/**
 * @module tools/incidentPlaybook
 * @description Incident response playbook registry for Unity Arena operations.
 *   Provides step-by-step response procedures for 12 predefined incident types
 *   that the operations team may encounter during a live event. Each playbook
 *   defines ordered response steps, required staff roles, estimated resolution
 *   time, and an escalation path for worsening situations.
 *
 *   Playbooks are returned by the `getIncidentPlaybook()` tool, which Gemini
 *   may call during operations brief generation or fan assistant responses.
 *   The steps are authored by venue safety professionals — Gemini may narrate
 *   or summarise them but MUST NEVER modify or generate replacement steps.
 *
 * @pr-changes
 *   - Added 12 incident types: crowd-surge, medical, fire, lost-child,
 *     elevator-failure, security, weather, power-outage, volunteer-shortage,
 *     movement-conflict, transport-disruption, queue-congestion.
 *   - Each playbook now includes `requiredRoles`, `estimatedMinutes`, and
 *     `escalationPath` fields for richer operational context.
 *   - Added a graceful fallback in `getIncidentPlaybook()` for unknown incident
 *     types: returns a two-step general procedure with a mandatory ops-manager
 *     notification rather than throwing.
 *   - `{ ...playbook }` shallow copy on return prevents callers from mutating
 *     the canonical playbook object in the PLAYBOOKS registry.
 *
 * @validation-review
 *   - The `incidentType` parameter is not validated against a fixed enum before
 *     the PLAYBOOKS lookup; unknown types silently return the general fallback.
 *     Consider validating against `Object.keys(PLAYBOOKS)` upstream (in toolDeclarations)
 *     to surface invalid types as tool errors rather than fallback responses.
 *   - Playbook steps are plain strings; they are returned directly to Gemini,
 *     which may paraphrase or selectively omit steps when narrating them.
 *     Critical steps (e.g. 'Do not use elevators during evacuation') should be
 *     marked as MUST-NOT-OMIT in a future structured format.
 *   - `requiredRoles` arrays are informational only; there is no enforcement
 *     mechanism to verify that the listed roles are actually available before
 *     a playbook is returned.
 *   - `estimatedMinutes` values are operational heuristics based on ideal
 *     staffing; under volunteer shortage conditions actual times may be much longer.
 *
 * @scope-of-improvement
 *   - Add a `severity: 'low'|'moderate'|'high'|'critical'` field to each playbook
 *     so callers can pre-filter by severity level before presenting options.
 *   - Support locale-specific playbook variants for multi-language venues;
 *     currently all steps are English-only.
 *   - Add a `lastReviewedAt` and `reviewedBy` field to each playbook for audit
 *     trail compliance — safety procedures must be regularly reviewed.
 *   - Allow dynamic playbook overrides via the operations state so venue managers
 *     can temporarily update step sequences during a live event without a deploy.
 *   - Add deep-freeze (`Object.freeze(PLAYBOOKS)`) to prevent accidental mutation
 *     of the canonical playbook registry at runtime.
 *
 * @business-intent
 *   Incident playbooks encode venue safety professional expertise into a format
 *   the AI system can reference during real emergencies. They ensure operations
 *   staff receive consistent, approved procedures regardless of which team member
 *   is on duty. The `escalationPath` field is especially critical — it defines
 *   when to escalate to police, medical services, or senior venue management,
 *   which is a decision that must follow a predefined safety protocol, not be
 *   improvised or AI-generated.
 */

/**
 * Registry of incident response playbooks, keyed by incident type string.
 *
 * @description Each playbook contains:
 *   - `type`: The incident type identifier (matches the key).
 *   - `steps`: Ordered array of response actions for venue staff.
 *   - `requiredRoles`: Staff roles needed to execute the playbook.
 *   - `estimatedMinutes`: Heuristic time to resolve under normal staffing.
 *   - `escalationPath`: Instructions for when the situation worsens.
 *
 * @type {Record<string, Object>}
 *
 * @risk-area
 *   These steps are returned to Gemini as tool results. Gemini must not
 *   re-order, omit, or paraphrase safety-critical steps. The system instruction
 *   must explicitly prohibit this. Any modification to these steps requires
 *   sign-off from venue safety management.
 *
 * @business-intent
 *   Standardised response procedures reduce decision fatigue during high-stress
 *   incidents and ensure legal compliance with venue safety regulations.
 *
 * @human-approval-required — Any change to playbook steps must be reviewed and
 *   approved by the venue's Head of Safety before deployment.
 */
const PLAYBOOKS = {
  'crowd-surge': {
    type: 'crowd-surge',
    // #Business-Intent — Steps are ordered by urgency; the first step must always
    //   be notification to senior staff before any physical intervention.
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
    // #What — Escalation path defines the exact trigger and action for worsening;
    //         must be explicit to prevent subjective 'judgment calls' under pressure.
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
    // #Risk-Area — Fire evacuation steps are safety-critical and legally mandated;
    //   any change requires fire safety officer sign-off and a re-training session.
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
    // #Business-Intent — The 15-minute escalation trigger ensures partial evacuation
    //   decision is made before fans become anxious in dark enclosed areas.
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
 * Retrieve the response playbook for a given incident type.
 *
 * @description Looks up the `incidentType` key in the PLAYBOOKS registry and
 *   returns a shallow copy of the matching playbook. If the type is not found
 *   (e.g. a novel incident type or a Gemini hallucination), returns a safe
 *   two-step general procedure rather than throwing, ensuring the operations
 *   team always receives actionable guidance.
 *
 * @param {string} incidentType - Incident type identifier (e.g. 'crowd-surge', 'fire').
 * @returns {Object} Playbook object with `type`, `steps`, `requiredRoles`,
 *   `estimatedMinutes`, `escalationPath`, and optionally `note` on fallback.
 *
 * @validation-note
 *   The fallback note (`'No specific playbook found for this incident type'`)
 *   signals to ops staff that the procedure is generic. This field should be
 *   displayed prominently in the ops dashboard when present.
 *
 * @business-intent
 *   Returning a general procedure for unknown types rather than erroring ensures
 *   ops staff always get a starting point during novel incidents, reducing
 *   decision paralysis in time-critical situations.
 *
 * @risk-area
 *   The shallow copy (`{ ...playbook }`) prevents callers from mutating the
 *   canonical PLAYBOOKS registry at runtime. If nested objects (e.g. `steps`)
 *   are mutated by the caller, the canonical steps array is unaffected only
 *   because arrays in the spread are shared by reference — a deep clone would
 *   be safer.
 */
export function getIncidentPlaybook(incidentType) {
  // #What — Look up the incident type in the registry; undefined means unknown type.
  const playbook = PLAYBOOKS[incidentType];

  if (!playbook) {
    // #Uncertain — Gemini may call this tool with a hallucinated incident type;
    //   the fallback gracefully handles this without a server error.
    // #Business-Intent — Always return actionable guidance; an empty response
    //   is worse than a generic "contact the operations manager" instruction.
    return {
      type: incidentType,
      steps: [
        'Assess the situation and contact the Operations Manager immediately.',
        'Follow general emergency procedures.',
      ],
      requiredRoles: ['operations-manager'],
      estimatedMinutes: 10,
      escalationPath: 'Contact venue security commander.',
      // #What — The note field signals to callers and UI that this is a generic
      //         fallback, not a pre-approved specific procedure.
      note: 'No specific playbook found for this incident type. General procedures applied.',
    };
  }

  // #What — Return a shallow copy to prevent callers from mutating the registry;
  //         the steps array itself is still a shared reference (intentional for performance).
  return { ...playbook };
}
