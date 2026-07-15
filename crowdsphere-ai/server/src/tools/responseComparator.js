/**
 * @module tools/responseComparator
 * @description Response option comparator tool for Unity Arena incidents.
 *   Provides a deterministic trade-off analysis for response options based on
 *   active incident details, the matching response playbook, and local volunteer
 *   availability. Gemini may request this comparison to help operations staff
 *   evaluate options, but the options and trade-offs are generated deterministically
 *   by this module, never hallucinated by the AI model.
 *
 * @pr-changes
 *   - Implemented three comparison options: full-immediate, staged-response, and
 *     monitor-await-escalation.
 *   - Integrated `getVolunteerAvailability()` to dynamically assess whether local
 *     volunteer shortages exist in the affected zone and list it as a con.
 *   - Restructured return values to satisfy Zod schemas and UI requirements.
 *   - Set `humanApprovalRequired: true` on all generated options to enforce the
 *     review process.
 *
 * @validation-review
 *   - `incidentId` is matched against the incidents array; if not found, returns
 *     a single safe 'monitor' option instead of throwing.
 *   - `volunteers.zones` lookup handles cases where the incident zone is not found in
 *     the volunteer tracker baseline.
 *   - Playbook resolution time is incremented by 8 minutes in the staged-response
 *     option as a realistic overhead penalty.
 *   - `humanApprovalRequired` is explicitly injected into all options returned.
 *
 * @scope-of-improvement
 *   - Support dynamic resource requirements that query actual volunteer lists
 *     rather than playbook role strings.
 *   - Allow customization of options and pros/cons via operations state.
 *   - Add numeric cost estimations (token consumption, staff overhead) for each option.
 *
 * @business-intent
 *   Helps operations managers perform structured decision-making during incidents by
 *   presenting clear trade-offs, preventing hasty deployments that could exhaust
 *   resources needed elsewhere in the venue.
 */

import { getIncidentPlaybook } from './incidentPlaybook.js';
import { getVolunteerAvailability } from './volunteerTracker.js';

/**
 * Compare available response options for an active incident and return trade-offs.
 *
 * @description Analyzes the active incident against the safety playbook and volunteer
 *   tracker, composing up to three options:
 *   1. Full Immediate Response: Deploy all recommended roles immediately.
 *   2. Staged Response: Deploy assessor first, then commit.
 *   3. Monitor and Observe: Await escalation (only for non-critical incidents).
 *
 * @param {string} incidentId - Active incident ID to compare options for.
 * @param {{ zones: Array<Object>, incidents: Array<Object> }} crowdState - Current crowd state.
 * @returns {Array<Object>} List of response options with pros, cons, and metadata.
 *
 * @risk-area
 *   If the playbook does not exist for an incident, the fallback playbook is used,
 *   which could lead to generic role lists. Operators should be aware of fallbacks.
 *
 * @business-intent
 *   Ensures that every recommended deployment is accompanied by a clear analysis of pros,
 *   cons, and resource requirements, aiding staff in choosing the safest response.
 */
export function compareResponseOptions(incidentId, crowdState) {
  // #What — Find the target incident in the current crowd state snapshot.
  const incident = crowdState.incidents.find((i) => i.id === incidentId);

  if (!incident) {
    // #What — A safe monitor-only fallback if the incident ID is invalid or not active.
    // #Business-Intent — Prevents server crashes if Gemini passes an outdated incident ID.
    return [{
      option: 'monitor',
      label: 'Monitor and Observe',
      description: 'Continue monitoring the situation. No immediate intervention.',
      pros: ['No resource commitment', 'Avoids premature escalation'],
      cons: ['Situation may worsen without response'],
      resourceRequired: 'none',
      estimatedResolutionMinutes: 30,
      riskIfDelayed: 'moderate',
      humanApprovalRequired: true,
    }];
  }

  // #What — Retrieve the pre-approved playbook and current zone volunteer coverage.
  const playbook = getIncidentPlaybook(incident.type);
  const volunteers = getVolunteerAvailability(incident.zone);
  const zoneVolunteers = volunteers.zones.find((z) => z.zoneId === incident.zone);
  
  // #What — Check if the zone currently has adequate volunteer coverage.
  const hasVolunteers = zoneVolunteers && !zoneVolunteers.shortage;

  const options = [];

  // ── Option 1: Full immediate response ──────────────────────────────────────
  // #Business-Intent — The default safety protocol: resolve the incident as quickly
  //   as possible, highlighting if volunteer shortages might delay deployment.
  options.push({
    option: 'full-immediate',
    label: 'Full Immediate Response',
    description: `Deploy full response team immediately. ${playbook.requiredRoles.join(', ')} to ${incident.zone}.`,
    pros: [
      'Fastest resolution time',
      'Reduces escalation risk',
      `Expected resolution in ${playbook.estimatedMinutes} minutes`,
    ],
    cons: [
      'Draws resources from other zones',
      hasVolunteers ? 'Volunteers available' : 'Volunteer shortage may delay deployment',
    ],
    resourceRequired: playbook.requiredRoles.join(', '),
    estimatedResolutionMinutes: playbook.estimatedMinutes,
    riskIfDelayed: incident.severity === 'critical' ? 'critical' : 'high',
    humanApprovalRequired: true,
  });

  // ── Option 2: Staged response ──────────────────────────────────────────────
  // #Business-Intent — Recommended for lower-severity incidents to conserve venue
  //   resources, with a trade-off of 8 minutes added to resolution time.
  options.push({
    option: 'staged-response',
    label: 'Staged Response',
    description: 'Deploy first-responder to assess, then commit full team based on confirmed severity.',
    pros: [
      'Preserves resources for other zones',
      'Avoids over-response to lower-severity incidents',
      'Allows real assessment before commitment',
    ],
    cons: [
      `Adds 5–10 minutes to resolution time`,
      'May be insufficient for rapidly-escalating incidents',
    ],
    resourceRequired: 'steward (assessment) then ' + playbook.requiredRoles[0],
    estimatedResolutionMinutes: playbook.estimatedMinutes + 8, // #What — Adds an 8-minute assessment overhead penalty
    riskIfDelayed: incident.severity,
    humanApprovalRequired: true,
  });

  // ── Option 3: Monitor and await escalation ────────────────────────────────
  // #Business-Intent — Only allow this option if the incident is not critical.
  //   Critical incidents must have active responses.
  if (incident.severity !== 'critical') {
    options.push({
      option: 'monitor',
      label: 'Monitor — Await Escalation',
      description: 'Continue monitoring. Intervene only if severity increases. Suitable for low-severity incidents.',
      pros: [
        'No resource commitment',
        'Appropriate for self-resolving situations',
      ],
      cons: [
        'Situation may escalate',
        `Not recommended for severity: ${incident.severity}`,
      ],
      resourceRequired: 'none',
      estimatedResolutionMinutes: null,
      riskIfDelayed: 'moderate',
      humanApprovalRequired: true,
    });
  }

  return options;
}
