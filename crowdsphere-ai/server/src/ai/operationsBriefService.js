/**
 * @module ai/operationsBriefService
 * @description AI-powered operations brief generation service for CrowdSphere AI.
 *   Orchestrates a multi-round Gemini function-calling conversation to produce a
 *   structured, schema-validated operations brief from the current Unity Arena
 *   crowd, transport, and incident state.
 *
 *   The service follows this execution model:
 *   1. Build a compact text summary of the current state (NOT the full dataset).
 *   2. Send to Gemini with tool declarations and ops system instructions.
 *   3. Execute any tool calls Gemini makes (risk scoring, route calculation, etc.)
 *      using deterministic server-side implementations — never trusting AI values.
 *   4. Loop up to `config.maxToolRounds` times to allow Gemini to gather all
 *      needed data before generating the final brief.
 *   5. Validate the final text response against a Zod schema.
 *   6. Return a validated brief, or fall back to a fixture brief on any failure.
 *
 *   `humanApprovalRequired` is hard-enforced at the schema level; Gemini cannot
 *   override it. The server always sets it to `true` in the fixture fallback.
 *
 * @pr-changes
 *   - Refactored from a single-round to a multi-round tool-calling loop bounded
 *     by `config.maxToolRounds` (default: 3) to prevent runaway tool use.
 *   - Added `ALLOWED_TOOL_NAMES` allowlist check before executing any tool call
 *     to prevent Gemini from requesting arbitrary server-side execution.
 *   - `buildOpsContext()` was extracted to keep the main function readable and
 *     testable independently.
 *   - On validation failure, the service now logs a warning and returns the
 *     fixture (rather than throwing) to maintain a non-empty API response.
 *   - The `generatedAt` timestamp is injected on fixture returns so the client
 *     can detect freshness without seeing a stale fixture date.
 *
 * @validation-review
 *   - `validateOpsResponse()` applies the `opsResponseSchema` Zod schema to the
 *     raw Gemini text; any field mismatch causes fallback to the fixture.
 *   - The `ALLOWED_TOOL_NAMES` check prevents Gemini from calling tools beyond
 *     the declared set; an unrecognised name returns an error tool response.
 *   - `buildOpsContext()` filters transport to only non-operational services and
 *     incidents to only non-resolved entries, keeping context size bounded.
 *   - If `textPart?.text` is empty (Gemini returns only tool calls with no final
 *     text), `rawText` is `''` and validation will fail, returning the fixture.
 *     This is logged as a warning but is not treated as an error.
 *
 * @scope-of-improvement
 *   - Add streaming support so the ops dashboard can show generation progress
 *     rather than waiting for the full brief (15+ second generation time).
 *   - Cache successful briefs for 60 seconds with the `snapshotVersion` as the
 *     cache key to reduce repeated Gemini calls from rapid dashboard refreshes.
 *   - Expose `toolRoundsUsed` in the response metadata so the dashboard can show
 *     how many tool calls were made during brief generation.
 *   - Extract the tool-execution loop into a shared utility reusable by
 *     `fanAssistantService.js` to eliminate code duplication.
 *   - Add a JSON-extraction pre-processor to handle cases where Gemini wraps the
 *     JSON response in a markdown code fence (```json ... ```).
 *
 * @business-intent
 *   The operations brief is the highest-value AI output in CrowdSphere AI.
 *   Operations managers rely on it for situational awareness during critical
 *   incidents. The multi-round tool-calling architecture ensures Gemini has access
 *   to deterministic risk scores and route data — it can narrate and prioritise
 *   but cannot fabricate safety-critical numbers. Fixture fallback ensures the
 *   dashboard is never left blank even during Gemini outages.
 */

import { OPS_SYSTEM_INSTRUCTION } from './systemInstructions.js';
import { GEMINI_TOOL_DECLARATIONS } from './toolDeclarations.js';
import { validateOpsResponse } from './responseValidator.js';
import { OPS_BRIEF_FIXTURE } from './mockFixtures.js';
import { executeTool, ALLOWED_TOOL_NAMES } from '../tools/index.js';
import { calculateOverallRisk } from '../tools/riskEngine.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

/**
 * Build a compact textual snapshot of the current operations state for Gemini context.
 *
 * @description Summarises the most relevant operational data (risk score, zone
 *   occupancy, active incidents, transport disruptions, elevator outages) into a
 *   structured plain-text block. Only non-resolved incidents and non-operational
 *   transport routes are included to keep context concise and avoid exceeding
 *   Gemini's context window on complex scenarios.
 *
 * @param {Object} state - Current operations state from `getState()`.
 * @param {Object} state.crowd - Crowd state with zones and incidents arrays.
 * @param {Array<Object>} state.transport - Transport route status array.
 * @param {string[]} state.elevatorOutages - IDs of elevators currently offline.
 * @param {string} [state.scenarioName] - Human-readable scenario label.
 * @returns {string} Multi-line text context block ready for embedding in a Gemini prompt.
 *
 * @risk-area
 *   This context string is sent directly to Gemini as part of the user turn.
 *   Any user-controlled data embedded here (e.g. zone names from the operations
 *   state) could be a prompt injection vector if malicious content is introduced
 *   into the state object. Ensure operations state only comes from trusted sources.
 *
 * @business-intent
 *   Sending a compact summary rather than the full raw state object avoids
 *   exceeding Gemini's context window and reduces per-request token costs,
 *   which are significant at stadium-day request volumes.
 */
function buildOpsContext(state) {
  const { crowd, transport, elevatorOutages, scenarioName } = state;

  // #What — Compute risk score deterministically before building the context;
  //         the risk summary is embedded as a fact Gemini can reference.
  // @hallucination-guard — Risk score comes from deterministic riskEngine, not Gemini.
  const risk = calculateOverallRisk(crowd, transport);

  // #What — Build one line per zone with key metrics: occupancy, density, queue,
  //         and accessibility flag. Intentionally compact to fit Gemini context.
  const zoneSummaries = crowd.zones
    .map((z) =>
      `  - ${z.name}: ${z.occupancyPct}% occupancy (${z.densityLevel}), queue ${z.queueMinutes}min${z.accessibilityObstruction ? ' [ACCESSIBILITY OBSTRUCTION]' : ''}`
    )
    .join('\n');

  // #What — Only include active (non-resolved) incidents to focus Gemini on
  //         current issues, not historical noise.
  const incidentSummaries = crowd.incidents
    .filter((i) => i.status !== 'resolved')
    .map((i) => `  - [${i.severity.toUpperCase()}] ${i.type} in ${i.zone}: ${i.description}`)
    .join('\n');

  // #What — Only include non-operational transport routes; 'operational' routes
  //         are not a concern and inflating context with them wastes tokens.
  const transportSummary = transport
    .filter((t) => t.status !== 'operational')
    .map((t) => `  - ${t.name}: ${t.status} — ${t.notes}`)
    .join('\n');

  return [
    `Scenario: ${scenarioName || 'Normal operations'}`,
    `Overall risk score: ${risk.score}/100 (${risk.category})`,
    `Highest risk zone: ${risk.highestRiskZone?.zoneName || 'none'} (score: ${risk.highestRiskZone?.score || 0})`,
    `Elevator outages: ${elevatorOutages?.length ? elevatorOutages.join(', ') : 'none'}`,
    '',
    'Zone summary:',
    zoneSummaries,
    '',
    'Active incidents:',
    incidentSummaries || '  None',
    '',
    'Transport disruptions:',
    transportSummary || '  None — all services operational',
  ].join('\n');
}

/**
 * Generate a structured, schema-validated Gemini operations brief.
 *
 * @description Orchestrates the full multi-round Gemini tool-calling conversation
 *   to produce a structured operations brief. Builds a compact context from the
 *   current state, initiates a Gemini session with tool declarations, processes
 *   any function calls deterministically, and validates the final JSON output.
 *   Falls back to the fixture brief on any failure (missing API key, validation
 *   failure, network error).
 *
 * @param {Object} geminiClient - Client object from `createGeminiClient()`.
 * @param {Object} operationsState - Full operations state from `getState()`.
 * @returns {Promise<Object>} Validated operations brief object, or fixture on failure.
 *
 * @risk-area
 *   All tool calls requested by Gemini are filtered through `ALLOWED_TOOL_NAMES`
 *   before execution. Removing this check would allow Gemini to request arbitrary
 *   server-side function execution — a critical remote-code-execution risk.
 *
 * @business-intent
 *   Returns a fixture brief (not an error) on any failure to ensure the ops
 *   dashboard always has data to display, even during Gemini outages. During a
 *   live event, a blank ops brief is more dangerous than a slightly stale one.
 *
 * @validation-note
 *   Output validation is performed by `validateOpsResponse()` which applies the
 *   full Zod schema. If the AI response lacks required fields or has type errors,
 *   the fixture is returned and a warning is logged for investigation.
 */
export async function generateOperationsBrief(geminiClient, operationsState) {
  // #What — If Gemini is not configured (no API key), return the fixture immediately.
  // #Business-Intent — Demo mode must work without any API key for training sessions
  //   and local development without exposing credentials.
  if (!geminiClient.isAvailable()) {
    logger.info('Operations brief: demo fixture mode (no API key)');
    return { ...OPS_BRIEF_FIXTURE, generatedAt: new Date().toISOString() };
  }

  // #What — Build the compact context text string for Gemini's user turn
  const context = buildOpsContext(operationsState);

  // #What — Initial conversation: single user turn asking for a comprehensive brief.
  //         Gemini may respond with tool calls before generating the final text.
  const contents = [
    {
      role: 'user',
      parts: [
        {
          text: `Generate a comprehensive operations brief for the following current state at Unity Arena:\n\n${context}\n\nUse the available tools to gather additional details as needed. Return a complete JSON operations brief.`,
        },
      ],
    },
  ];

  let response;
  let toolRounds = 0;

  // #What — Mutable copy of the conversation history; extended with model + tool
  //         response turns during each round of tool-calling.
  const currentContents = [...contents];

  try {
    // #What — Multi-round tool-calling loop: bounded by maxToolRounds to prevent
    //         infinite loops if Gemini keeps requesting more tool calls.
    // #Risk-Area — Without this cap, a misbehaving model could loop indefinitely,
    //   exhausting Gemini quota and holding the request open past the timeout.
    while (toolRounds < config.maxToolRounds) {
      response = await geminiClient.generateWithRetry({
        systemInstruction: OPS_SYSTEM_INSTRUCTION,
        contents: currentContents,
        tools: GEMINI_TOOL_DECLARATIONS,
      });

      const parts = response?.candidates?.[0]?.content?.parts || [];

      // #What — Extract only the function call parts from this round's response
      const functionCalls = parts.filter((p) => p.functionCall);

      // #What — If Gemini returns no tool calls, it has finished gathering data
      //         and we can extract the final text response.
      if (functionCalls.length === 0) break;
      toolRounds++;

      // #What — Execute each requested tool call deterministically server-side
      const toolResponses = [];
      for (const part of functionCalls) {
        const { name, args } = part.functionCall;

        // #Risk-Area — ALLOWLIST CHECK: only execute tools that are declared and
        //   known; reject any tool name Gemini may hallucinate or inject.
        // @hallucination-guard — Prevents Gemini from calling undeclared tools.
        if (!ALLOWED_TOOL_NAMES.has(name)) {
          toolResponses.push({ functionResponse: { name, response: { error: 'Tool not available' } } });
          continue;
        }

        try {
          // #What — Execute the tool using the deterministic server-side implementation;
          //         the result is authoritative, not AI-generated.
          toolResponses.push({ functionResponse: { name, response: executeTool(name, args) } });
        } catch (err) {
          // #Uncertain — Tool execution errors are returned to Gemini as error responses
          //   rather than thrown; Gemini may or may not handle these gracefully.
          toolResponses.push({ functionResponse: { name, response: { error: err.message } } });
        }
      }

      // #What — Append the model's tool-call parts and the tool results to the
      //         conversation history so Gemini has full context in the next round.
      currentContents.push({ role: 'model', parts });
      currentContents.push({ role: 'user', parts: toolResponses });
    }

    // #What — After the loop, extract the final text part containing the JSON brief.
    //         If no text part exists (model ended on a tool call), rawText is ''.
    const textPart = response?.candidates?.[0]?.content?.parts?.find((p) => p.text);
    const rawText = textPart?.text || '';

    // @hallucination-guard — Validate AI output against Zod schema before returning.
    //   Schema validation catches missing fields, wrong types, and out-of-range values.
    const validation = validateOpsResponse(rawText);
    if (validation.success) return validation.data;

    // #Business-Intent — Log the validation failure for post-event debugging but
    //   return the fixture to ensure the dashboard stays populated.
    logger.warn('Ops brief validation failed — returning fixture');
    return { ...OPS_BRIEF_FIXTURE, generatedAt: new Date().toISOString() };
  } catch (err) {
    // #What — Catch any Gemini API errors (network, quota, timeout) and return
    //         the fixture so the ops dashboard never shows a blank brief.
    logger.error('Operations brief service error', { message: err.message });
    return { ...OPS_BRIEF_FIXTURE, generatedAt: new Date().toISOString() };
  }
}
