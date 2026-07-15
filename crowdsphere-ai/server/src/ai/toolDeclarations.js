/**
 * @module ai/toolDeclarations
 * @description Gemini function-calling declarations for all 10 deterministic stadium
 *   management tools exposed to the CrowdSphere AI models. Each declaration specifies
 *   the tool name, a natural-language description for the model, and a JSON Schema
 *   definition of the parameters the model may pass when invoking the tool.
 *
 *   These declarations form the boundary of what the AI model is permitted to request.
 *   Any function not listed here cannot be called by Gemini, regardless of what a user
 *   prompt instructs. The actual tool implementations live in `src/tools/index.js` and
 *   are executed server-side only.
 *
 * @pr-changes
 *   - Added `getAccessibleRoute` as a dedicated tool (separate from `getVenueRoute`)
 *     to give the model an unambiguous way to request fully accessible routing without
 *     needing to set multiple preference flags.
 *   - Added `compareResponseOptions` tool to enable the ops analyst model to surface
 *     trade-off analysis for active incidents directly within the brief.
 *   - Expanded `getFacilityLocations` type description to include `sensory_room`,
 *     `prayer_room`, `family_assistance`, and `lost_found` facility types.
 *   - All tool descriptions updated to mention "Unity Arena" and "deterministic" to
 *     reinforce to the model that it should not invent results.
 *
 * @validation-review
 *   - Tool names in this file MUST exactly match the keys in the `ALLOWED_TOOL_NAMES`
 *     Set defined in `src/tools/index.js`. Any mismatch will cause the allowlist check
 *     in fanAssistantService and operationsBriefService to reject the tool call and
 *     return a "Tool not available" error to the model.
 *   - Parameter schemas use JSON Schema (not Zod) because this is the format required
 *     by the Gemini SDK's `functionDeclarations` API.
 *   - `required` arrays are intentionally minimal; the model is trusted to call tools
 *     with sensible optional parameters based on context.
 *   - `getCurrentOperationsSnapshot` has an empty properties object — the tool takes
 *     no parameters. Verify the SDK accepts an empty-properties schema without error.
 *
 * @scope-of-improvement
 *   - Generate this array programmatically from a shared tool registry so that adding
 *     a new tool automatically updates both the declaration and the allowlist.
 *   - Add `examples` fields to each parameter description to improve model accuracy
 *     for node IDs, zone IDs, and facility types.
 *   - Validate this array against the ALLOWED_TOOL_NAMES Set in a CI test to catch
 *     name mismatches before they reach production.
 *   - Add a version field to each declaration so breaking parameter changes can be
 *     tracked alongside model prompt versions.
 *   - Consider adding per-tool rate-limit metadata (max calls per session) to support
 *     future cost-control features.
 *
 * @business-intent
 *   The function-calling mechanism is the bridge between the non-deterministic AI layer
 *   and the deterministic, auditable tool layer. By declaring only pre-approved tools
 *   here, the product guarantees that the AI model can never access unapproved data
 *   sources or trigger unapproved side effects — a key safety and compliance requirement
 *   for venue management software handling crowds of tens of thousands of people.
 */

/**
 * Array of Gemini function declarations for all stadium management tools.
 *
 * @description Passed directly to the Gemini SDK as `functionDeclarations` inside the
 *   `tools` config array. The SDK serialises these into the model's context so it can
 *   request tool invocations during function-calling turns.
 *
 * @type {Array<Object>}
 *
 * @risk-area Each declaration's `description` field is part of the model's instruction
 *   surface. Carefully worded descriptions are essential for guiding the model to call
 *   the correct tool with correct parameters. Vague descriptions lead to hallucinated
 *   arguments or wrong tool selection.
 *
 * @business-intent Limiting the model to exactly these 10 tools enforces the principle
 *   of least privilege: the AI can only access the specific venue data needed to serve
 *   fans and operations staff, never arbitrary external APIs or internal system resources.
 */
export const GEMINI_TOOL_DECLARATIONS = [
  {
    // #What — Standard venue routing tool; supports all preference combinations including
    //         wheelchair, step-free, avoid-crowds, and avoid-long-walking.
    name: 'getVenueRoute',
    // #Business-Intent — Routing is the most common fan request; accurate route descriptions
    //                    directly reduce fan anxiety and venue congestion.
    description: 'Calculate the shortest walking route between two locations in Unity Arena. Returns verified route with steps, distance, time, and crowd warnings.',
    parameters: {
      type: 'object',
      properties: {
        // #What — Node IDs are defined in the venue graph; examples help the model use valid IDs.
        from: { type: 'string', description: 'Source node ID (e.g., gate-a, zone-north-concourse, section-214)' },
        to: { type: 'string', description: 'Destination node ID' },
        preferences: {
          type: 'object',
          description: 'Route preferences',
          properties: {
            // #Business-Intent — Wheelchair preference triggers the full accessible routing
            //                    algorithm which avoids stairs and checks elevator availability.
            wheelchair: { type: 'boolean', description: 'Require wheelchair-accessible route' },
            stepFree: { type: 'boolean', description: 'Require step-free (no stairs) route' },
            avoidStairs: { type: 'boolean', description: 'Avoid stair edges where possible' },
            avoidCrowds: { type: 'boolean', description: 'Prefer less-crowded zones' },
            avoidLongWalking: { type: 'boolean', description: 'Prefer shorter distance routes' },
          },
        },
      },
      // #What — `from` and `to` are required; all preferences are optional.
      required: ['from', 'to'],
    },
  },
  {
    // #What — Dedicated accessible routing tool that automatically applies all accessibility
    //         flags AND checks live elevator outage data — the model should prefer this tool
    //         over getVenueRoute when a fan has mobility requirements.
    name: 'getAccessibleRoute',
    // #Business-Intent — Separating accessible routing into its own tool makes the model's
    //                    intent explicit in logs and simplifies the routing engine's
    //                    constraint-satisfaction logic.
    description: 'Calculate a fully wheelchair-accessible and step-free route, automatically avoiding unavailable elevators. Use this when a fan has mobility requirements.',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Source node ID' },
        to: { type: 'string', description: 'Destination node ID' },
        preferences: {
          type: 'object',
          properties: {
            // #What — avoidCrowds and avoidLongWalking are the only additional preferences
            //         relevant for accessible routing; wheelchair/stepFree are always applied.
            avoidCrowds: { type: 'boolean' },
            avoidLongWalking: { type: 'boolean' },
          },
        },
      },
      required: ['from', 'to'],
    },
  },
  {
    // #What — Facility search tool; supports all venue facility types including accessible
    //         and specialist facilities (sensory room, prayer room, family assistance).
    name: 'getFacilityLocations',
    // #Business-Intent — Fast, accurate facility location reduces queue congestion at
    //                    information desks and improves the accessible fan experience.
    description: 'Find facilities in Unity Arena by type. Returns location, accessibility, and zone information.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          // #What — Exhaustive list of valid facility types; the model must not invent values.
          // @hallucination-guard — The tool implementation validates this enum server-side;
          //                        invalid values are rejected before any data is queried.
          description: 'Facility type: toilet, accessible_toilet, medical, water_refill, food, information, prayer_room, sensory_room, family_assistance, lost_found, volunteer_station, elevator, ramp, stairs, emergency_exit, recycling',
        },
        // #Business-Intent — `accessible` filter ensures mobility-impaired fans only
        //                    receive facilities they can physically reach and use.
        accessible: { type: 'boolean', description: 'Return only accessible facilities' },
        nearZone: { type: 'string', description: 'Prefer facilities near this zone ID' },
        // #What — Limit defaults to a sensible value in the tool implementation;
        //         max of 20 prevents the model from requesting an unbounded result set.
        limit: { type: 'number', description: 'Maximum results (1-20)' },
      },
      required: ['type'],
    },
  },
  {
    // #What — Real-time zone crowd status tool; used to inform routing decisions and warnings.
    name: 'getZoneStatus',
    // #Business-Intent — Live zone occupancy data is the core operational input for both
    //                    fan guidance and the operations analyst's risk assessment.
    description: 'Get current crowd status for a zone or all zones. Returns occupancy, density level, queue time, and accessibility obstruction status.',
    parameters: {
      type: 'object',
      properties: {
        // #What — Omitting zoneId returns status for all zones; used by the ops analyst
        //         to get a full venue overview in a single tool call.
        zoneId: { type: 'string', description: 'Zone ID to get status for (omit for all zones)' },
      },
    },
  },
  {
    // #What — Transport options tool; returns current operational status for all departure modes.
    name: 'getTransportOptions',
    // #Business-Intent — Accurate transport status is critical for post-match crowd dispersal;
    //                    incorrect departure information could cause dangerous platform congestion.
    description: 'Get available transport options from Unity Arena with current operational status.',
    parameters: {
      type: 'object',
      properties: {
        // #Business-Intent — Accessible transport filter ensures fans with mobility needs
        //                    receive only options they can use.
        accessible: { type: 'boolean', description: 'Return only accessible transport' },
        type: {
          type: 'string',
          // #What — Enum enforced at the tool level; the model cannot request an unknown type.
          enum: ['metro', 'bus', 'shuttle', 'taxi', 'accessible_transport', 'bicycle'],
          description: 'Filter by transport type',
        },
      },
    },
  },
  {
    // #What — Snapshot tool; provides a concise summary of all zones, incidents, and outages.
    //         Used by the ops analyst as a fast first-pass before drilling into specific zones.
    name: 'getCurrentOperationsSnapshot',
    // #Business-Intent — A single snapshot call reduces the number of tool-calling rounds
    //                    needed for the ops brief, lowering latency and API costs.
    description: 'Get a summary of the current operations state including all zone statuses, active incidents, and elevator outages.',
    // #What — Empty properties object: this tool takes no parameters.
    // #Uncertain — Verify the Gemini SDK does not reject an empty properties schema in
    //              all model versions; some versions may require at least one property.
    parameters: { type: 'object', properties: {} },
  },
  {
    // #What — Deterministic risk scoring tool; returns a 0-100 score with contributing factors.
    name: 'calculateZoneRisk',
    // #Business-Intent — Risk scores allow the ops analyst to prioritise responses
    //                    objectively, reducing cognitive bias in high-pressure situations.
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
    // #What — Incident response playbook tool; returns step-by-step SOP for a given incident type.
    name: 'getIncidentPlaybook',
    // #Business-Intent — Pre-defined playbooks ensure staff follow consistent, approved
    //                    procedures during incidents, reducing improvisation errors.
    description: 'Get the step-by-step response playbook for an incident type.',
    parameters: {
      type: 'object',
      properties: {
        incidentType: {
          type: 'string',
          // #What — Enumerated incident types match the venue SOP library; the model must
          //         use exact values to retrieve the correct playbook.
          // @hallucination-guard — The tool rejects unrecognised incident types server-side
          //                        to prevent the model from fabricating playbook content.
          description: 'Incident type: crowd-surge, medical, fire, lost-child, elevator-failure, security, weather, power-outage, volunteer-shortage, movement-conflict, transport-disruption, queue-congestion',
        },
      },
      required: ['incidentType'],
    },
  },
  {
    // #What — Volunteer availability tool; returns coverage gaps and shortage status by zone.
    name: 'getVolunteerAvailability',
    // #Business-Intent — Volunteer shortage data is a leading indicator of crowd management
    //                    capacity; early detection allows proactive redeployment before
    //                    incidents escalate.
    description: 'Get current volunteer coverage and shortage status, optionally filtered by zone.',
    parameters: {
      type: 'object',
      properties: {
        // #What — Omitting zone returns availability for all zones in the venue.
        zone: { type: 'string', description: 'Zone ID to check (omit for all zones)' },
      },
    },
  },
  {
    // #What — Response comparison tool; provides structured trade-off analysis for an active incident.
    name: 'compareResponseOptions',
    // #Business-Intent — Trade-off analysis helps operations managers make faster, better-
    //                    informed decisions about which response option to deploy, especially
    //                    when multiple options have similar severity scores.
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
