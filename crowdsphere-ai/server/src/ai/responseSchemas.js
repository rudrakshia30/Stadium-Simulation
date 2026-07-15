/**
 * @module ai/responseSchemas
 * @description Zod schema definitions for every Gemini AI response type used in the
 *   CrowdSphere AI system. Each schema acts as a contract between the AI layer and
 *   the rest of the server: any response that does not satisfy the schema is rejected
 *   before it reaches the client. Schemas are the single source of truth for response
 *   shape and field constraints across the fan assistant, operations brief, and
 *   announcement generation services.
 *
 * @pr-changes Introduced `humanApprovalRequired: z.literal(true)` as a mandatory,
 *   non-nullable field on both the opsResponseSchema and announcementResponseSchema
 *   (and on every priority item within opsResponseSchema). This ensures that even if
 *   the AI model omits or sets this flag to false, the server-side enforcement layer
 *   in responseValidator.js will replace it with true before Zod validation runs.
 *
 * @validation-review
 *   - `fanResponseSchema.answer` is bounded to 3000 characters to prevent
 *     runaway AI-generated text from consuming excessive bandwidth.
 *   - All enum fields use strict Zod enums so unexpected AI-generated values are
 *     rejected at the schema layer, not silently passed through.
 *   - `humanApprovalRequired: z.literal(true)` uses a Zod literal (not boolean)
 *     so the schema validation itself fails if the value is `false` — adding a
 *     second line of defence after the explicit enforcement in responseValidator.js.
 *   - `priorities` items are validated individually so a single malformed priority
 *     item does not cause the entire ops brief to fall back to the fixture.
 *   - Default values (.default()) ensure optional fields degrade gracefully rather
 *     than causing downstream null-reference errors.
 *
 * @scope-of-improvement
 *   - Replace individual schema exports with a registry map keyed by response type
 *     to enable dynamic lookup in the validator.
 *   - Add `.transform()` steps to normalise casing on language codes and intent values.
 *   - Consider moving character-length limits to a shared constants file so they can
 *     be tuned without touching schema logic.
 *   - Add `.refine()` rules to cross-validate fields (e.g. distanceMeters > 0
 *     implies routeSummary is non-empty).
 *   - Version the schemas (v1, v2) to support future model prompt changes without
 *     breaking backward compatibility.
 *
 * @business-intent
 *   The Gemini model is an external, non-deterministic service whose output cannot be
 *   assumed to be structurally correct on every call. These schemas enforce a strict
 *   data contract so the product UI always receives well-typed, bounded data — never
 *   raw AI text. The `humanApprovalRequired` literal is a business-safety control:
 *   all AI-generated operational actions MUST be reviewed by a human before execution.
 */

import { z } from 'zod';

/**
 * Schema for fan assistant AI responses.
 *
 * @description Validates the structured JSON object that the Gemini fan assistant
 *   must return. All fields are required unless a `.default()` is specified.
 *   The schema covers navigation, facility, transport, accessibility, and safety intents.
 *
 * @risk-area `answer` is a free-text string composed by the AI. Although the system
 *   prompt instructs the model not to include harmful content, downstream rendering
 *   code should still escape HTML before displaying this value in the browser.
 *
 * @business-intent Ensures every fan-facing response carries consistent metadata
 *   (confidence, dataFreshness, crowdLevel) that enables the UI to render contextual
 *   safety indicators without additional API calls.
 */
export const fanResponseSchema = z.object({
  // #What — Primary text answer; min(1) ensures an empty string fails validation.
  answer: z.string().min(1).max(3000),

  // #What — ISO 639-1 language code; kept flexible (max 10) to accommodate BCP-47 tags.
  language: z.string().min(2).max(10),

  // #Business-Intent — Intent classification drives UI routing (e.g. show a map for
  //                    'navigation', show transport cards for 'transportation').
  intent: z.enum(['navigation', 'facility', 'transportation', 'accessibility', 'safety', 'general']),

  // #What — Array of facts that were confirmed by deterministic tool calls, NOT by
  //         the AI model's own knowledge.
  // @hallucination-guard — Only tool-returned data should populate verifiedFacts.
  verifiedFacts: z.array(z.string()).default([]),

  // #What — Human-readable one-line route summary (empty string when no route was calculated).
  routeSummary: z.string().default(''),

  // #What — Opaque route ID returned by the routing engine; null when no route applies.
  routeId: z.string().nullable().default(null),

  // #What — Walking distance in metres; 0 when no route was calculated.
  distanceMeters: z.number().min(0).default(0),

  // #What — Estimated walking time in minutes; 0 when no route was calculated.
  estimatedMinutes: z.number().min(0).default(0),

  // #Business-Intent — Crowd level enum drives colour-coded UI indicators and
  //                    accessibility warnings for fans with mobility needs.
  crowdLevel: z.enum(['low', 'moderate', 'high', 'critical', 'unknown']).default('unknown'),

  // #What — Specific accessibility callouts (elevator status, ramp availability, etc.).
  accessibilityNotes: z.array(z.string()).default([]),

  // #What — Safety or crowd warnings the fan should be aware of before proceeding.
  warnings: z.array(z.string()).default([]),

  // #What — Next concrete step for the fan (e.g. "Proceed to Gate B and ask a steward").
  recommendedNextAction: z.string().default(''),

  // #Business-Intent — When true the UI surfaces a prominent "Please speak to staff"
  //                    banner; critical for fans who need in-person assistance.
  requiresStaffAssistance: z.boolean().default(false),

  // #What — Model self-reported confidence; used by the UI to add appropriate caveats.
  confidence: z.enum(['high', 'medium', 'low']).default('medium'),

  // #What — Human-readable description of how current the underlying data is.
  dataFreshness: z.string().default(''),

  // #What — Version token from the operations state snapshot used during generation.
  snapshotVersion: z.string().default('unknown'),
});

/**
 * Schema for operations brief AI responses.
 *
 * @description Validates the structured JSON briefing document that the Gemini
 *   operations analyst generates for stadium operations staff. Every priority action
 *   item carries its own `humanApprovalRequired: true` literal as well as the
 *   top-level flag, ensuring there is no code path through which an AI-generated
 *   operational action can appear in the UI without explicit human sign-off.
 *
 * @risk-area `recommendedActions` strings are rendered directly in the operations
 *   dashboard. If the AI were to inject HTML or script content, it could pose an
 *   XSS risk. Ensure the rendering layer escapes these strings.
 *
 * @business-intent Operations decisions (crowd dispersal, volunteer deployment, etc.)
 *   have direct safety implications for thousands of fans. The schema's dual
 *   `humanApprovalRequired` literals (top-level and per-priority) encode the
 *   product requirement that NO AI recommendation can be acted on autonomously.
 *
 * @human-approval-required Every priority action rendered by this schema must be
 *   reviewed and approved by a qualified operations manager before being executed.
 */
export const opsResponseSchema = z.object({
  // #What — ISO 8601 timestamp of when the brief was generated; used for freshness display.
  generatedAt: z.string(),

  // #Business-Intent — Top-level risk rating drives dashboard colour themes and alert thresholds.
  overallRisk: z.enum(['low', 'moderate', 'high', 'critical']),

  // #What — 2-3 sentence plain-language summary for the senior operations manager.
  executiveSummary: z.string().min(1).max(2000),

  // #What — Ordered list of actionable priorities; validated item-by-item.
  priorities: z.array(
    z.object({
      // #What — 1-based rank; determines display order in the dashboard priority list.
      rank: z.number().int().min(1),

      // #What — Short title displayed in the priority card heading.
      title: z.string().min(1),

      // #Business-Intent — Severity gates the notification channel (e.g. 'critical'
      //                    triggers an audible alert and SMS to the incident commander).
      severity: z.enum(['low', 'moderate', 'high', 'critical']),

      // #What — List of zone IDs affected; used to highlight zones on the venue map.
      affectedZones: z.array(z.string()),

      // #What — Verbatim evidence strings sourced from deterministic tool calls.
      // @hallucination-guard — Must not contain AI-inferred facts; only tool-returned data.
      verifiedEvidence: z.array(z.string()),

      // #What — Concrete action strings for the responsible role to execute.
      recommendedActions: z.array(z.string()),

      // #What — Explanation of why this priority was ranked where it is.
      rationale: z.string(),

      // #Business-Intent — Maps the action to a specific venue role so the dashboard
      //                    can route the notification to the right team.
      responsibleRole: z.string(),

      // #What — SLA in minutes; used to calculate a countdown timer on the dashboard.
      targetResponseMinutes: z.number().int().min(0),

      // @human-approval-required — z.literal(true) means the schema REJECTS a false value.
      //   This is the last line of defence after the responseValidator.js enforcement.
      // #Risk-Area — Never remove or relax this literal; doing so would allow automated
      //              action on AI-generated operational recommendations.
      humanApprovalRequired: z.literal(true),
    }),
  ),

  // #What — Draft fan-facing public message to be reviewed before broadcasting.
  fanCommunication: z.object({
    // #What — Language code for the draft message; must match the configured venue locale.
    language: z.string(),
    // @human-approval-required — This message draft must not be sent to PA/app without human review.
    message: z.string(),
  }),

  // #What — Bullet-point instructions for volunteer teams; reviewed before dispatch.
  volunteerInstructions: z.array(z.string()).default([]),

  // #What — AI-acknowledged gaps in its assessment; surfaces uncertainty to operators.
  uncertainties: z.array(z.string()).default([]),

  // #What — Data the AI would need to improve confidence; informs sensor/feed investments.
  missingInformation: z.array(z.string()).default([]),

  // #What — Overall confidence level of the AI's assessment.
  confidence: z.enum(['high', 'medium', 'low']),

  // @human-approval-required — Top-level flag enforced by responseValidator.js BEFORE this
  //                            schema runs; z.literal(true) provides a redundant second check.
  // #Risk-Area — This field must remain z.literal(true). Any schema change here requires
  //              explicit security review sign-off.
  humanApprovalRequired: z.literal(true),
});

/**
 * Schema for announcement generation AI responses.
 *
 * @description Validates the structured JSON object returned by the Gemini
 *   communications assistant. Announcements are intended for public broadcast (PA
 *   systems, in-app notifications, digital signage) and therefore carry a strict
 *   character-count limit and mandatory human-approval gate.
 *
 * @risk-area Announcements could cause panic if they contain inaccurate emergency
 *   information. The `humanApprovalRequired` literal ensures a human reviews the
 *   draft before it reaches any broadcast channel.
 *
 * @business-intent Multilingual announcements for fans and staff are a core product
 *   feature. The schema enforces a 1000-character ceiling (suitable for PA broadcast
 *   and push notifications) and captures `characterCount` so the UI can show a live
 *   character counter during the human review workflow.
 *
 * @human-approval-required Every announcement produced by this schema must be
 *   reviewed by an authorised communications officer before being broadcast.
 */
export const announcementResponseSchema = z.object({
  // #What — The final announcement text; max(1000) enforces PA/notification size limits.
  // #Risk-Area — This string is broadcast to the public; XSS and content-injection
  //              risks must be mitigated at the rendering layer.
  announcement: z.string().min(1).max(1000),

  // #What — Language code of the announcement; must match the requested locale.
  language: z.string(),

  // #What — Target audience identifier (fans, security, volunteers, etc.).
  audience: z.string(),

  // #What — Tone descriptor (urgent, informational, reassuring, instructional).
  tone: z.string(),

  // #What — Character count of the announcement text; validated for display in the
  //         human review UI alongside the character limit indicator.
  // #Uncertain — The AI-reported characterCount may differ from the actual string length
  //              if the model counts multi-byte characters differently. UI should
  //              independently compute announcement.length for display.
  characterCount: z.number().int().min(0),

  // @human-approval-required — z.literal(true) rejects any AI response that sets this
  //                            to false, providing schema-level enforcement of the approval gate.
  humanApprovalRequired: z.literal(true),
});
