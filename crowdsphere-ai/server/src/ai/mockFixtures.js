/**
 * Demo mode fixture responses.
 * Used when GEMINI_API_KEY is not configured.
 * Clearly labelled as fixtures — not real Gemini responses.
 *
 * @module ai/mockFixtures
 */

export const FAN_FIXTURE = {
  answer:
    'Welcome to Unity Arena! I have calculated a fully accessible route for you from Gate B to Section 214. The route goes via the East Concourse and Accessible Hub, using the elevator to reach the upper level. This route is wheelchair-accessible and step-free throughout. The East Concourse currently has low crowd density, making this an excellent time to proceed. Estimated walking time is approximately 6 minutes.\n\n[DEMO MODE: This response uses a pre-built fixture. Configure GEMINI_API_KEY for live AI responses.]',
  language: 'en',
  intent: 'navigation',
  verifiedFacts: [
    'Route calculated by venue routing engine (deterministic)',
    'East Concourse: 35% occupancy (low density)',
    'Accessible Hub: 20% occupancy (low density)',
    'Elevator (North): operational',
    'Section 214 has accessible seating',
  ],
  routeSummary:
    'Gate B → East Concourse → Accessible Hub (via elevator) → Section 214',
  routeId: 'demo-route-001',
  distanceMeters: 350,
  estimatedMinutes: 6,
  crowdLevel: 'low',
  accessibilityNotes: [
    'This route is fully wheelchair accessible',
    'No stairs on this route',
    'Elevator is currently operational',
    'Section 214 has designated accessible seating',
  ],
  warnings: [],
  recommendedNextAction:
    'Proceed to Gate B and follow signs to the East Concourse. Elevator is located at the north end of the concourse.',
  requiresStaffAssistance: false,
  confidence: 'high',
  dataFreshness: 'Simulated real-time data (demo fixture)',
  snapshotVersion: 'demo-v1.0',
};

export const OPS_BRIEF_FIXTURE = {
  generatedAt: new Date().toISOString(),
  overallRisk: 'moderate',
  executiveSummary:
    'Unity Arena is currently operating under normal pre-match conditions. Two minor incidents are active: a queue buildup at Gate A (self-resolving, low severity) and an accessibility obstruction near the North Concourse elevator (steward deployed, low severity). Overall crowd density is moderate. All transport services are operational.\n\n[DEMO MODE: This brief uses a pre-built fixture. Configure GEMINI_API_KEY for live AI analysis.]',
  priorities: [
    {
      rank: 1,
      title: 'Accessibility Obstruction — North Concourse',
      severity: 'low',
      affectedZones: ['zone-north-concourse', 'zone-accessible-hub'],
      verifiedEvidence: [
        'Incident inc-002: Merchandise stand partially blocking accessible corridor',
        'Volunteer already redirecting fans',
        'Accessible Hub occupancy: 20% (low density)',
      ],
      recommendedActions: [
        'Confirm stand has been relocated within 5 minutes',
        'Verify accessible corridor is fully clear',
        'Brief volunteer to remain at location until clear',
      ],
      rationale:
        'Accessibility obstructions must be resolved promptly to maintain safe passage for mobility-impaired fans.',
      responsibleRole: 'accessibility-volunteer',
      targetResponseMinutes: 5,
      humanApprovalRequired: true,
    },
    {
      rank: 2,
      title: 'Gate A Queue Buildup',
      severity: 'low',
      affectedZones: ['zone-gate-a-plaza'],
      verifiedEvidence: [
        'Incident inc-001: Minor queue at Gate A ticketing kiosk',
        'Gate A Plaza: 55% occupancy (moderate density)',
        'Queue time: 8 minutes',
      ],
      recommendedActions: [
        'Monitor queue time every 3 minutes',
        'If queue exceeds 15 minutes, deploy additional steward',
        'Consider broadcasting Gate B/C as lower-queue alternatives',
      ],
      rationale:
        'Queue is currently self-resolving. Standard monitoring is appropriate unless conditions change.',
      responsibleRole: 'steward',
      targetResponseMinutes: 15,
      humanApprovalRequired: true,
    },
  ],
  fanCommunication: {
    language: 'en',
    message:
      'Welcome to Unity Arena! Crowds are flowing smoothly through most gates. If you find Gate A busy, Gates B and C have shorter queues today. Our team is ready to assist you.',
  },
  volunteerInstructions: [
    'North Concourse team: maintain position near elevator until accessibility obstruction is cleared.',
    'Gate A team: maintain standard queue management. Report if queue exceeds 15 minutes.',
    'All teams: standard pre-match protocols in effect.',
  ],
  uncertainties: [
    'CCTV verification of Gate A queue has not been confirmed',
    'Accessibility obstruction resolution not yet confirmed by steward',
  ],
  missingInformation: [
    'Real-time CCTV data would improve accuracy of crowd density estimates',
    'Weather forecast for post-match exit period not available',
  ],
  confidence: 'medium',
  humanApprovalRequired: true,
};

export const ANNOUNCEMENT_FIXTURE = {
  announcement:
    'Attention Unity Arena guests: We are experiencing a higher volume of fans at Gate A. For a faster entry, we recommend using Gate B or Gate C, which currently have shorter queues. Thank you for your patience, and enjoy the match!',
  language: 'en',
  audience: 'fans',
  tone: 'informational',
  characterCount: 228,
  humanApprovalRequired: true,
};
