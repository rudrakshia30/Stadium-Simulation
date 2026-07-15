/**
 * @module ai/mockFixtures
 * @description Static fixture objects used as fallback responses when the Gemini API
 *   key is not configured (demo mode) or when AI response validation fails. Each
 *   fixture is a fully-typed object that satisfies the corresponding Zod schema so
 *   the rest of the application code can treat fixture data identically to live AI
 *   responses. All fixtures are clearly labelled with [DEMO MODE] disclaimers in
 *   their human-readable text fields to prevent fixture data from being mistaken for
 *   real operational intelligence.
 *
 * @pr-changes Populated all fixture objects with realistic Unity Arena scenario data
 *   (zone names, incident descriptions, volunteer instructions) to improve demo
 *   presentations. Added the [DEMO MODE] disclaimer suffix to answer and
 *   executiveSummary text fields so evaluators are never misled. Set
 *   humanApprovalRequired: true on OPS_BRIEF_FIXTURE and ANNOUNCEMENT_FIXTURE to
 *   ensure fixtures pass schema validation without needing special-case handling.
 *
 * @validation-review
 *   - All fixture objects must satisfy their respective Zod schemas
 *     (fanResponseSchema, opsResponseSchema, announcementResponseSchema). If a schema
 *     field is added or its constraints change, the corresponding fixture must be
 *     updated immediately or validation of the fallback path will fail.
 *   - `humanApprovalRequired: true` is hard-coded in every applicable fixture; it
 *     must never be removed or set to false.
 *   - OPS_BRIEF_FIXTURE.generatedAt is evaluated at module import time
 *     (new Date().toISOString()). This is overwritten by callers using spread syntax
 *     so the timestamp reflects the actual request time, not module load time.
 *   - characterCount in ANNOUNCEMENT_FIXTURE is a manually maintained number; verify
 *     it matches the actual announcement string length when the text is updated.
 *
 * @scope-of-improvement
 *   - Generate fixtures programmatically from a shared scenario config file so they
 *     stay in sync with the data model without manual maintenance.
 *   - Add a fixture validation test that runs the fixtures through their Zod schemas
 *     as part of the CI pipeline.
 *   - Support multiple fixture variants (e.g. high-crowd, post-match) selectable via
 *     an environment variable for richer demo scenarios.
 *   - Freeze fixture objects (Object.freeze) to prevent accidental mutation in tests.
 *
 * @business-intent
 *   The product must remain demonstrable at industry events and in CI environments
 *   where the Gemini API key is intentionally absent. Fixtures enable a full UX
 *   walkthrough without incurring API costs or exposing credentials. They also
 *   provide a deterministic fallback when the AI service is temporarily degraded,
 *   ensuring the operations dashboard never shows an empty or broken state.
 */

/**
 * Demo fixture for the fan assistant response.
 *
 * @description A pre-built fan assistant response that demonstrates a wheelchair-
 *   accessible navigation scenario from Gate B to Section 214. Used whenever Gemini
 *   is unavailable or the live response fails validation.
 *
 * @type {Object}
 *
 * @business-intent Allows sales demos and accessibility testing without requiring a
 *   live API connection. The accessibility-focused scenario was chosen deliberately
 *   to showcase the product's inclusive design to potential venue partners.
 *
 * @risk-area This fixture is returned to real end-users when the AI is unavailable.
 *   The [DEMO MODE] tag in the answer text is the only indicator distinguishing it
 *   from a live response. Ensure this disclaimer is never removed.
 */
export const FAN_FIXTURE = {
  // #What — Primary answer text shown to the fan; includes a mandatory demo disclaimer.
  // #Risk-Area — This text is rendered in the fan UI. If the disclaimer is removed,
  //              users may treat fixture data as live operational guidance.
  answer:
    'Welcome to Unity Arena! I have calculated a fully accessible route for you from Gate B to Section 214. The route goes via the East Concourse and Accessible Hub, using the elevator to reach the upper level. This route is wheelchair-accessible and step-free throughout. The East Concourse currently has low crowd density, making this an excellent time to proceed. Estimated walking time is approximately 6 minutes.\n\n[DEMO MODE: This response uses a pre-built fixture. Configure GEMINI_API_KEY for live AI responses.]',

  // #What — Language defaults to English for the demo fixture; callers may spread-override this.
  language: 'en',

  // #What — Intent is 'navigation' to trigger the map panel in the UI.
  intent: 'navigation',

  // #What — verifiedFacts lists data points as if they came from deterministic tool calls.
  // @hallucination-guard — These facts are statically defined; they must not be presented
  //                        to users as live operational data outside demo mode.
  verifiedFacts: [
    'Route calculated by venue routing engine (deterministic)',
    'East Concourse: 35% occupancy (low density)',
    'Accessible Hub: 20% occupancy (low density)',
    'Elevator (North): operational',
    'Section 214 has accessible seating',
  ],

  // #What — Human-readable route path for display in the journey summary card.
  routeSummary:
    'Gate B → East Concourse → Accessible Hub (via elevator) → Section 214',

  // #What — Opaque route ID; callers use this to deep-link to the venue map route.
  routeId: 'demo-route-001',

  // #What — Approximate walking distance in metres for the demo scenario.
  distanceMeters: 350,

  // #What — Approximate walking time in minutes for the demo scenario.
  estimatedMinutes: 6,

  // #Business-Intent — Low crowd level is shown for demo to illustrate the green-state
  //                    indicator and avoid alarming stakeholders during presentations.
  crowdLevel: 'low',

  // #What — Accessibility notes surface important route information in a dedicated UI panel.
  accessibilityNotes: [
    'This route is fully wheelchair accessible',
    'No stairs on this route',
    'Elevator is currently operational',
    'Section 214 has designated accessible seating',
  ],

  // #What — Empty warnings array indicates no hazards on the demo route.
  warnings: [],

  // #What — Clear next-action instruction for the fan; must be actionable and specific.
  recommendedNextAction:
    'Proceed to Gate B and follow signs to the East Concourse. Elevator is located at the north end of the concourse.',

  // #What — false: no staff assistance needed for this straightforward accessible route.
  requiresStaffAssistance: false,

  // #Business-Intent — High confidence is shown in the demo to illustrate the best-case
  //                    UI state; real responses may show medium or low confidence.
  confidence: 'high',

  // #What — Explicit label so developers and testers can identify fixture data in logs.
  dataFreshness: 'Simulated real-time data (demo fixture)',

  // #What — Version token clearly identifies this as demo data in audit logs.
  snapshotVersion: 'demo-v1.0',
};

/**
 * Demo fixture for the operations brief response.
 *
 * @description A pre-built operations brief for Unity Arena showing two low-severity
 *   incidents (queue buildup, accessibility obstruction) under normal pre-match
 *   conditions. Used in demo mode and as a safe fallback when Gemini validation fails.
 *
 * @type {Object}
 *
 * @business-intent Demonstrates the full operations dashboard UX — including the
 *   priority card layout, volunteer instructions panel, and fan communication draft —
 *   without requiring a live API key. The moderate-risk, low-severity scenario was
 *   chosen to showcase realistic (not alarming) operational decision support.
 *
 * @human-approval-required humanApprovalRequired is hard-coded to true in this fixture.
 *   All priority actions require explicit operator approval before being actioned.
 *
 * @risk-area generatedAt is set at module import time. The service layer MUST
 *   overwrite this value (via spread) with the actual request timestamp when returning
 *   this fixture to a client, otherwise stale timestamps will appear in the UI.
 */
export const OPS_BRIEF_FIXTURE = {
  // #What — Evaluated at import time; callers must spread-override with the request timestamp.
  // #Uncertain — Module-level new Date().toISOString() means all requests served before
  //              the next server restart share the same generatedAt value if not overridden.
  generatedAt: new Date().toISOString(),

  // #What — Moderate risk chosen for the demo to illustrate a realistic operational state.
  overallRisk: 'moderate',

  // #What — Executive summary includes the mandatory demo disclaimer for fixture transparency.
  // #Risk-Area — If this fixture is accidentally returned to production users the [DEMO MODE]
  //              tag is the only indicator; ensure it is never stripped.
  executiveSummary:
    'Unity Arena is currently operating under normal pre-match conditions. Two minor incidents are active: a queue buildup at Gate A (self-resolving, low severity) and an accessibility obstruction near the North Concourse elevator (steward deployed, low severity). Overall crowd density is moderate. All transport services are operational.\n\n[DEMO MODE: This brief uses a pre-built fixture. Configure GEMINI_API_KEY for live AI analysis.]',

  // #What — Two ranked priority items demonstrate the card-based priority UI component.
  priorities: [
    {
      rank: 1,
      // #Business-Intent — Accessibility obstruction is ranked #1 to reinforce the product's
      //                    inclusive-design principle: mobility-impaired fans have absolute priority.
      title: 'Accessibility Obstruction — North Concourse',
      severity: 'low',
      affectedZones: ['zone-north-concourse', 'zone-accessible-hub'],
      // @hallucination-guard — verifiedEvidence strings in fixtures are static; they must not
      //                        be presented as live tool output outside of demo mode.
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
      // @human-approval-required — Must remain true; any action must be authorised by a human operator.
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
      // @human-approval-required — Must remain true; any action must be authorised by a human operator.
      humanApprovalRequired: true,
    },
  ],

  // #What — Draft fan communication for review before broadcasting; not sent automatically.
  // @human-approval-required — This message must be reviewed by a communications officer before dispatch.
  fanCommunication: {
    language: 'en',
    message:
      'Welcome to Unity Arena! Crowds are flowing smoothly through most gates. If you find Gate A busy, Gates B and C have shorter queues today. Our team is ready to assist you.',
  },

  // #What — Volunteer instructions for the demo; reviewed by team leads before distribution.
  volunteerInstructions: [
    'North Concourse team: maintain position near elevator until accessibility obstruction is cleared.',
    'Gate A team: maintain standard queue management. Report if queue exceeds 15 minutes.',
    'All teams: standard pre-match protocols in effect.',
  ],

  // #What — Uncertainties acknowledge the limits of the demo data; builds operator trust.
  uncertainties: [
    'CCTV verification of Gate A queue has not been confirmed',
    'Accessibility obstruction resolution not yet confirmed by steward',
  ],

  // #What — Missing information informs future sensor/integration investments.
  missingInformation: [
    'Real-time CCTV data would improve accuracy of crowd density estimates',
    'Weather forecast for post-match exit period not available',
  ],

  // #What — Medium confidence reflects that the fixture data is not live sensor data.
  confidence: 'medium',

  // @human-approval-required — Top-level flag; must remain true in all fixture and live responses.
  humanApprovalRequired: true,
};

/**
 * Demo fixture for the announcement generation response.
 *
 * @description A pre-built public announcement addressing a Gate A queue scenario.
 *   Used in demo mode and as a safe fallback when announcement validation fails.
 *
 * @type {Object}
 *
 * @business-intent Demonstrates the announcement generation UX — tone selection,
 *   audience targeting, character counter, and approval workflow — without requiring
 *   a live Gemini API key.
 *
 * @human-approval-required humanApprovalRequired is hard-coded to true. This
 *   announcement must never be broadcast without explicit human review.
 *
 * @risk-area characterCount (228) must be kept in sync with the actual announcement
 *   string length. If the announcement text is edited, recalculate this value.
 */
export const ANNOUNCEMENT_FIXTURE = {
  // #What — Public-facing announcement text; max 1000 chars per announcementResponseSchema.
  // #Risk-Area — This string is broadcast to the public. Content changes require
  //              editorial review and must not introduce alarming language.
  announcement:
    'Attention Unity Arena guests: We are experiencing a higher volume of fans at Gate A. For a faster entry, we recommend using Gate B or Gate C, which currently have shorter queues. Thank you for your patience, and enjoy the match!',

  // #What — Language for the demo fixture; callers spread-override with the requested locale.
  language: 'en',

  // #What — Target audience for the demo; callers spread-override with the selected audience.
  audience: 'fans',

  // #What — Tone for the demo; informational is appropriate for a non-emergency queue notice.
  tone: 'informational',

  // #Uncertain — This value (228) is manually maintained. Verify against the actual
  //              announcement string length if the text above is ever edited.
  characterCount: 228,

  // @human-approval-required — Must remain true; fixture announcements require the same
  //                            review workflow as live AI-generated announcements.
  humanApprovalRequired: true,
};
