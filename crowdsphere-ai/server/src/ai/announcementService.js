/**
 * @module ai/announcementService
 * @description AI service that generates audience-specific, multilingual venue
 *   announcements for Unity Arena. Accepts a structured context (audience, language,
 *   tone, optional incident reference, optional recommendation text) and returns a
 *   Gemini-generated announcement draft that must pass Zod schema validation before
 *   being surfaced to the caller.
 *
 *   CRITICAL SAFETY RULE: Every announcement returned by this module carries
 *   `humanApprovalRequired: true`. No AI-generated announcement may be broadcast
 *   over PA systems, push notifications, or digital signage without explicit review
 *   and approval by an authorised communications officer.
 *
 * @pr-changes
 *   - Introduced `ALLOWED_AUDIENCES`, `ALLOWED_TONES`, and `ALLOWED_LANGUAGES`
 *     allowlist constants for input validation (currently defined but not yet enforced
 *     at the service layer — enforcement is deferred to the route handler).
 *   - Announcement generation now uses `generateWithRetry` (single transient retry)
 *     instead of the raw `generateContent` call.
 *   - Falls back to `ANNOUNCEMENT_FIXTURE` (with audience/language/tone overrides)
 *     on both validation failure and unexpected errors.
 *   - Context building filters empty strings via `.filter(Boolean)` to prevent blank
 *     lines from appearing in the Gemini prompt when optional fields are omitted.
 *
 * @validation-review
 *   - `humanApprovalRequired: true` is enforced server-side in `validateAnnouncementResponse`
 *     (responseValidator.js) before Zod validation runs — the AI model cannot set it to false.
 *   - The Gemini prompt explicitly states `humanApprovalRequired must always be true`
 *     (systemInstructions.js) as a second line of defence.
 *   - `incidentId` lookup uses strict equality (`===`) against `operationsState.crowd.incidents`;
 *     a non-matching ID silently results in `incident = null` and the prompt proceeds without
 *     incident context rather than throwing.
 *   - Response validation uses Zod via `validateAnnouncementResponse`; failures fall back to
 *     the fixture rather than exposing raw AI text.
 *   - No tool-calling loop is used for announcements (unlike fan/ops services) because
 *     announcements are composed from the provided context only — no additional data fetching.
 *
 * @scope-of-improvement
 *   - Enforce `ALLOWED_AUDIENCES`, `ALLOWED_TONES`, and `ALLOWED_LANGUAGES` at the service
 *     layer (not just the route handler) with explicit 400 errors for invalid values.
 *   - Add a character-count pre-check: if `maxLength` is below a sensible minimum
 *     (e.g. 30 chars), return an early error rather than sending a nonsensical prompt.
 *   - Implement a schema-repair retry loop (as in fanAssistantService) for announcements
 *     so transient JSON formatting errors are recovered without falling back to the fixture.
 *   - Log the validated announcement text (truncated) for content auditing and quality
 *     monitoring without storing full AI outputs indefinitely.
 *   - Consider caching identical context+params combinations for a short TTL (30 s) to
 *     reduce redundant Gemini calls during high-traffic scenarios.
 *
 * @business-intent
 *   Public announcements are a primary crowd-management tool in large venues. AI-assisted
 *   drafting accelerates the communications workflow for operations staff (especially
 *   during simultaneous multi-zone incidents) while the mandatory human approval gate
 *   ensures accuracy and prevents panic-inducing or legally inappropriate language from
 *   being broadcast automatically.
 */

import { ANNOUNCEMENT_SYSTEM_INSTRUCTION } from './systemInstructions.js';
import { validateAnnouncementResponse } from './responseValidator.js';
import { ANNOUNCEMENT_FIXTURE } from './mockFixtures.js';
import { logger } from '../utils/logger.js';

// #What — Allowlists for audience, tone, and language are enforced via validators/opsRequestSchema.js.

/**
 * Generate a multilingual, audience-specific venue announcement draft using Gemini AI.
 *
 * @description Builds a structured context string from the provided parameters (audience,
 *   language, tone, max character length, optional incident reference, optional recommendation
 *   text) and sends it to Gemini for announcement generation. The raw response is validated
 *   against the `announcementResponseSchema` Zod schema before being returned. On validation
 *   failure or any service error, the function falls back to the `ANNOUNCEMENT_FIXTURE` with
 *   the caller's audience/language/tone overridden for contextual accuracy.
 *
 * @param {Object}  params
 * @param {string}  params.audience            - Target audience (must be in ALLOWED_AUDIENCES).
 * @param {string}  params.language            - Language code (must be in ALLOWED_LANGUAGES).
 * @param {string}  params.tone               - Announcement tone (must be in ALLOWED_TONES).
 * @param {number}  params.maxLength          - Maximum character count for the announcement.
 * @param {string}  [params.incidentId]       - Optional ID of the incident to reference;
 *                                               matched against operationsState.crowd.incidents.
 * @param {string}  [params.recommendationText] - Optional operations recommendation to include
 *                                               as additional context in the prompt.
 * @param {Object}  geminiClient              - Configured Gemini client (from createGeminiClient).
 * @param {Object}  operationsState           - Current venue operations state from getState().
 *
 * @returns {Promise<Object>} Validated announcement response satisfying announcementResponseSchema,
 *   or the ANNOUNCEMENT_FIXTURE on failure. Always includes `humanApprovalRequired: true`.
 *
 * @business-intent Provides operations staff with an AI-drafted starting point for public
 *   communications, reducing drafting time during time-critical incidents while ensuring
 *   human oversight remains mandatory before broadcast.
 *
 * @human-approval-required Every object returned by this function carries
 *   `humanApprovalRequired: true` and must not be broadcast without explicit human review.
 *
 * @risk-area The `incident.description` field sourced from `operationsState` is embedded
 *   directly into the Gemini prompt. If this field contains adversarial content (e.g. from
 *   a tampered incident record), it could be used for prompt injection. The system instruction
 *   includes a prompt-injection guard, but input sanitisation at the data ingestion layer
 *   is also recommended.
 */
export async function generateAnnouncement(params, geminiClient, operationsState) {
  const { audience, language, tone, maxLength, incidentId, recommendationText } = params;

  // #What — Demo mode: return the fixture immediately if no API key is configured.
  //         Spread the fixture and override audience/language/tone so the returned
  //         object reflects the caller's request context, not the fixture's defaults.
  // #Business-Intent — Enables demo presentations and CI environments to exercise the
  //                    full announcement UX flow without incurring API costs.
  if (!geminiClient.isAvailable()) {
    logger.info('Announcement: demo fixture mode (no API key)');
    return { ...ANNOUNCEMENT_FIXTURE, audience, language, tone };
  }

  // #What — Attempt to resolve the referenced incident from the current operations state.
  //         Returns null if no incidentId is provided or if the ID does not match any
  //         active incident — the prompt then proceeds without incident context.
  // #Uncertain — A stale or recycled incident ID could silently match a resolved incident
  //              that is still present in the state array. Consider filtering by status !== 'resolved'.
  const incident = incidentId
    ? operationsState.crowd.incidents.find((i) => i.id === incidentId)
    : null;

  // #What — Build the structured context block that forms the user turn of the Gemini conversation.
  //         Each line adds a specific piece of information the model needs to draft the announcement.
  const context = [
    `Target audience: ${audience}`,
    `Language: ${language}`,
    `Tone: ${tone}`,
    // #Business-Intent — maxLength is passed explicitly so the model respects the character
    //                    budget for the target broadcast medium (PA, push notification, etc.).
    `Maximum length: ${maxLength} characters`,
    // #What — Include incident details only when an incident was successfully resolved.
    //         The conditional prevents "null" or "undefined" from appearing in the prompt.
    incident
      ? `Incident: ${incident.type} (${incident.severity}) in ${incident.zone} — "${incident.description}"`
      : 'No specific incident selected.',
    // #What — Include the recommendation text only when it was explicitly provided by the caller.
    recommendationText
      ? `Operational recommendation: ${recommendationText}`
      : '',
    '',
    // #Business-Intent — Explicitly remind the model that Unity Arena is fictional and data
    //                    is simulated; prevents the model from generating real-world references.
    'Unity Arena (fictional demonstration venue).',
    'All data is simulated.',
  ]
    // #What — Remove empty strings so blank lines don't appear in the prompt when optional
    //         fields are absent; keeps the context block clean and token-efficient.
    .filter(Boolean)
    .join('\n');

  try {
    // #What — Single generateWithRetry call (no tool-calling loop needed for announcements;
    //         context is fully provided in the prompt without needing additional data fetching).
    const response = await geminiClient.generateWithRetry({
      systemInstruction: ANNOUNCEMENT_SYSTEM_INSTRUCTION,
      contents: [
        {
          role: 'user',
          parts: [{ text: `Generate an announcement for the following context:\n\n${context}` }],
        },
      ],
    });

    // #What — Extract the text part from the first candidate's content parts array.
    //         Fallback to empty string if the structure is unexpected (prevents crashes).
    const textPart = response?.candidates?.[0]?.content?.parts?.find((p) => p.text);
    const rawText = textPart?.text || '';

    // @hallucination-guard — validateAnnouncementResponse enforces the Zod schema AND
    //                        injects humanApprovalRequired: true before schema validation.
    const validation = validateAnnouncementResponse(rawText);
    if (validation.success) return validation.data;

    // #What — Validation failed: log and fall back to the fixture to prevent a broken
    //         or empty announcement from reaching the operations dashboard.
    logger.warn('Announcement validation failed — returning fixture');
    return { ...ANNOUNCEMENT_FIXTURE, audience, language, tone };
  } catch (err) {
    // #What — Catch-all for unexpected errors (network failures, SDK exceptions, etc.).
    //         Return the fixture to keep the UI functional even under service degradation.
    logger.error('Announcement service error', { message: err.message });
    return { ...ANNOUNCEMENT_FIXTURE, audience, language, tone };
  }
}
