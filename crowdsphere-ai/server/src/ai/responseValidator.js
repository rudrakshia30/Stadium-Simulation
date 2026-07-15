/**
 * @module ai/responseValidator
 * @description Central validation gateway for all Gemini AI responses in the
 *   CrowdSphere AI system. Every raw string or object returned by the Gemini SDK
 *   passes through one of the three exported validator functions before it reaches
 *   any route handler or UI client. Validators never throw — they always return a
 *   discriminated union `{ success: true, data }` or `{ success: false, error }` so
 *   callers can handle failures gracefully without try/catch boilerplate.
 *
 *   Additionally, this module enforces business-safety rules that are too critical
 *   to leave to AI discretion: `humanApprovalRequired` is unconditionally set to
 *   `true` on all ops brief and announcement objects before Zod validation runs,
 *   regardless of what value the AI model provided.
 *
 * @pr-changes
 *   - Added unconditional `humanApprovalRequired: true` injection into
 *     validateOpsResponse and validateAnnouncementResponse (server-side enforcement).
 *   - Introduced markdown code-fence stripping in parseJson so Gemini responses
 *     wrapped in ```json … ``` blocks are handled without an extra prompt-repair loop.
 *   - Extended ops response validation logging to include up to 1000 chars of raw
 *     text to assist debugging of partial/truncated AI responses.
 *   - Per-priority `humanApprovalRequired: true` injection added to ensure every
 *     action item inside an ops brief also carries the approval flag.
 *
 * @validation-review
 *   - parseJson handles three input shapes: plain JS objects (passthrough), JSON
 *     strings, and JSON strings wrapped in markdown code fences. Any other format
 *     returns { ok: false }.
 *   - Zod `.safeParse()` is used throughout — never `.parse()` — so schema failures
 *     are captured in a result rather than thrown as exceptions.
 *   - `humanApprovalRequired` injection happens BEFORE Zod validation so the literal
 *     constraint `z.literal(true)` in the schema always sees a guaranteed `true` value.
 *   - Partial priorities arrays (where AI omits the field entirely) default to `[]`
 *     to prevent the spread from crashing on a non-iterable value.
 *   - Raw text is logged (truncated to 1000 chars) on ops validation failure to aid
 *     debugging without saturating log storage with full AI outputs.
 *
 * @scope-of-improvement
 *   - Extract the `humanApprovalRequired` injection into a shared utility function
 *     to avoid the pattern being duplicated across validateOpsResponse and
 *     validateAnnouncementResponse.
 *   - Add structured logging of validation failure reasons to a dedicated metrics
 *     channel for tracking AI response quality over time.
 *   - Implement a partial-success mode for ops briefs: if the top-level fields are
 *     valid but one priority item is malformed, return the valid priorities and flag
 *     the malformed one rather than discarding the entire brief.
 *   - Consider adding a sanitisation step to strip HTML/script from free-text fields
 *     before they reach the Zod validator.
 *
 * @business-intent
 *   The Gemini model is a probabilistic system — it can produce structurally invalid
 *   JSON, omit required fields, or (in adversarial scenarios) attempt to set
 *   `humanApprovalRequired: false`. This module is the server-side enforcement point
 *   that prevents any such output from reaching the client. It is the last line of
 *   defence between the AI layer and the operational dashboard.
 */

import { fanResponseSchema, opsResponseSchema, announcementResponseSchema } from './responseSchemas.js';
import { logger } from '../utils/logger.js';

/**
 * Safely parse a raw value into a plain JavaScript object.
 *
 * @description Handles three input forms:
 *   1. A plain JS object — returned as-is (already parsed).
 *   2. A string containing a JSON object wrapped in a markdown code fence (```json … ```).
 *   3. A plain JSON string.
 *
 * @param {string|Object} raw - The raw value to parse; typically the text part of a
 *   Gemini API response.
 *
 * @returns {{ ok: true, value: Object }|{ ok: false, error: string }}
 *   A discriminated union. Callers must check `ok` before accessing `value`.
 *
 * @risk-area This function is the entry point for all external AI-generated content.
 *   Any code that reaches JSON.parse here originates from the Gemini API and must be
 *   treated as untrusted. Zod validation in the calling function provides the
 *   structural safety net after parsing.
 */
function parseJson(raw) {
  // #What — If the Gemini SDK already deserialised the response into an object
  //         (e.g. in structured-output mode), return it directly without re-parsing.
  if (typeof raw === 'object' && raw !== null) return { ok: true, value: raw };

  // #What — Gemini sometimes wraps its JSON output in markdown code fences
  //         (```json … ```) despite being instructed not to. The regex strips
  //         the fence and extracts only the JSON content.
  // @hallucination-guard — This stripping step prevents the model's markdown formatting
  //                        from causing a valid JSON payload to fail parsing.
  const jsonMatch = String(raw).match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1] : String(raw);

  try {
    // #What — Trim whitespace from the extracted string before parsing to handle
    //         leading/trailing newlines that JSON.parse would otherwise reject.
    return { ok: true, value: JSON.parse(jsonStr.trim()) };
  } catch (err) {
    // #What — Return a structured failure rather than throwing so callers can handle
    //         parse failures without wrapping every call in a try/catch.
    return { ok: false, error: `JSON parse failed: ${err.message}` };
  }
}

/**
 * Validate a fan assistant AI response against the fanResponseSchema.
 *
 * @description Parses the raw Gemini output and validates it against the Zod fan
 *   response schema. Returns the typed, validated data on success or a structured
 *   error object on failure. Never throws.
 *
 * @param {string|Object} raw - Raw text or object from the Gemini API response.
 *
 * @returns {{ success: true, data: Object }|{ success: false, error: string }}
 *   On success, `data` is the Zod-parsed object with all defaults applied.
 *   On failure, `error` is a human-readable description of the first validation issue.
 *
 * @business-intent Fan responses are shown directly in the consumer-facing UI.
 *   Validation ensures fans never receive structurally broken data (e.g. missing
 *   `answer` field) that would result in a blank or crashed UI component.
 *
 * @risk-area The `answer` field is free-text AI output. Although this validator
 *   checks structure and length, content safety (harmful advice, PII) is enforced
 *   upstream by the system instruction — not here.
 */
export function validateFanResponse(raw) {
  const parsed = parseJson(raw);
  if (!parsed.ok) {
    // #What — Log the parse failure with the error message so engineers can diagnose
    //         whether the model returned malformed JSON or non-JSON text.
    logger.warn('Fan response JSON parse failed', { error: parsed.error });
    return { success: false, error: parsed.error };
  }

  // @hallucination-guard — safeParse enforces the schema contract; any field the model
  //                        invented or omitted is caught here before reaching the client.
  const result = fanResponseSchema.safeParse(parsed.value);
  if (!result.success) {
    logger.warn('Fan response schema validation failed', {
      // #What — Map Zod issues to "path: message" strings for concise structured logging.
      issues: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    });
    return { success: false, error: result.error.message };
  }

  // #What — result.data is the Zod-parsed value with all `.default()` values applied;
  //         safe to return directly to the route handler.
  return { success: true, data: result.data };
}

/**
 * Validate an operations brief AI response against the opsResponseSchema.
 *
 * @description Parses the raw Gemini output, injects `humanApprovalRequired: true`
 *   unconditionally at both the top level and on every priority item, then validates
 *   the result against the Zod ops response schema. Never throws.
 *
 * @param {string|Object} raw - Raw text or object from the Gemini API response.
 *
 * @returns {{ success: true, data: Object }|{ success: false, error: string }}
 *   On success, `data` is the Zod-parsed brief with all approval flags enforced.
 *   On failure, `error` is a human-readable description of the first validation issue.
 *
 * @business-intent Operations briefs drive real-world decisions about crowd control,
 *   volunteer deployment, and emergency response. The `humanApprovalRequired: true`
 *   injection ensures no AI-generated recommendation can bypass the human review
 *   workflow regardless of what the model outputs.
 *
 * @risk-area This is the primary server-side enforcement point for the human-approval
 *   policy. If this function is bypassed or the injection is removed, the product's
 *   core safety guarantee is broken.
 *
 * @human-approval-required The data returned by this function powers the ops
 *   dashboard approval workflow. Every priority action must be reviewed by an
 *   authorised operations manager before being executed.
 */
export function validateOpsResponse(raw) {
  const parsed = parseJson(raw);
  if (!parsed.ok) {
    logger.warn('Ops response JSON parse failed', { error: parsed.error });
    return { success: false, error: parsed.error };
  }

  // @human-approval-required — Server-side injection: humanApprovalRequired is forced
  //   to true regardless of what the AI model provided. This runs BEFORE Zod validation
  //   so the z.literal(true) constraint in opsResponseSchema always succeeds.
  // #Risk-Area — This block is a critical business-safety control. Any modification
  //              here requires explicit security review and sign-off.
  const withEnforcement = {
    ...parsed.value,
    // #What — Force the top-level approval flag to true unconditionally.
    humanApprovalRequired: true,
    // #What — Map over priorities (defaulting to [] if missing/non-array) to inject
    //         humanApprovalRequired: true into every individual action item.
    priorities: Array.isArray(parsed.value.priorities)
      ? parsed.value.priorities.map((p) => ({ ...p, humanApprovalRequired: true }))
      : [],
  };

  // @hallucination-guard — Zod validation rejects any field the model invented or that
  //                        falls outside the defined enums and constraints.
  const result = opsResponseSchema.safeParse(withEnforcement);
  if (!result.success) {
    logger.warn('Ops response schema validation failed', {
      issues: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      // #What — Log up to 1000 chars of raw text to aid debugging without flooding logs.
      rawText: typeof raw === 'string' ? raw.slice(0, 1000) : JSON.stringify(raw).slice(0, 1000)
    });
    return { success: false, error: result.error.message };
  }

  return { success: true, data: result.data };
}

/**
 * Validate an announcement generation AI response against the announcementResponseSchema.
 *
 * @description Parses the raw Gemini output, injects `humanApprovalRequired: true`
 *   unconditionally, then validates against the Zod announcement schema. Never throws.
 *
 * @param {string|Object} raw - Raw text or object from the Gemini API response.
 *
 * @returns {{ success: true, data: Object }|{ success: false, error: string }}
 *   On success, `data` is the Zod-parsed announcement with the approval flag enforced.
 *   On failure, `error` is a human-readable description of the first validation issue.
 *
 * @business-intent Public announcements broadcast over PA systems or push notifications
 *   carry reputational and safety risks if inaccurate. The `humanApprovalRequired: true`
 *   injection ensures every AI-generated announcement must be reviewed by a qualified
 *   communications officer before it reaches any broadcast channel.
 *
 * @risk-area Announcement text is broadcast to potentially tens of thousands of fans.
 *   Inaccurate or panicking language could directly cause crowd safety incidents.
 *
 * @human-approval-required The data returned by this function powers the announcement
 *   review workflow. No announcement may be sent without explicit human approval.
 */
export function validateAnnouncementResponse(raw) {
  const parsed = parseJson(raw);
  if (!parsed.ok) {
    logger.warn('Announcement response JSON parse failed', { error: parsed.error });
    return { success: false, error: parsed.error };
  }

  // @human-approval-required — Server-side injection: humanApprovalRequired is forced
  //   to true before Zod validation runs, matching the same pattern as validateOpsResponse.
  // #Risk-Area — Do not remove or conditionalise this injection. Announcements broadcast
  //              without human approval could cause crowd safety incidents.
  const withEnforcement = { ...parsed.value, humanApprovalRequired: true };

  // @hallucination-guard — Zod validation catches out-of-range character counts,
  //                        missing fields, and unexpected values before they reach the UI.
  const result = announcementResponseSchema.safeParse(withEnforcement);
  if (!result.success) {
    logger.warn('Announcement response schema validation failed', {
      issues: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    });
    return { success: false, error: result.error.message };
  }

  return { success: true, data: result.data };
}
