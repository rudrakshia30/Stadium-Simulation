/**
 * Response option comparator for Unity Arena incidents.
 * Provides deterministic trade-off analysis for response choices.
 *
 * @module tools/responseComparator
 */

import { getIncidentPlaybook } from './incidentPlaybook.js';
import { getVolunteerAvailability } from './volunteerTracker.js';

/**
 * Compare available response options for an active incident.
 *
 * @param {string} incidentId
 * @param {{ zones: Array<Object>, incidents: Array<Object> }} crowdState
 * @returns {Array<Object>} Ordered response options with trade-offs
 */
export function compareResponseOptions(incidentId, crowdState) {
  const incident = crowdState.incidents.find((i) => i.id === incidentId);

  if (!incident) {
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

  const playbook = getIncidentPlaybook(incident.type);
  const volunteers = getVolunteerAvailability(incident.zone);
  const zoneVolunteers = volunteers.zones.find((z) => z.zoneId === incident.zone);
  const hasVolunteers = zoneVolunteers && !zoneVolunteers.shortage;

  const options = [];

  // Option 1: Full immediate response
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

  // Option 2: Staged response
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
    estimatedResolutionMinutes: playbook.estimatedMinutes + 8,
    riskIfDelayed: incident.severity,
    humanApprovalRequired: true,
  });

  // Option 3: Monitor and await escalation
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
