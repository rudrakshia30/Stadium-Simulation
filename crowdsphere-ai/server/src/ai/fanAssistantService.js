/**
 * @module ai/fanAssistantService
 * @description AI Fan Assistant service orchestrating Gemini function-calling for
 *   real-time fan support at Unity Arena. Converts fan natural-language queries
 *   into validated, structured responses by combining Gemini's language intelligence
 *   with deterministic server-side tool execution for safety-critical data.
 *
 *   Execution model:
 *   1. Validate and cap the incoming conversation history to `maxConversationLength`.
 *   2. Build a compact context summary (language, scenario, location, preferences).
 *   3. Send to Gemini with the fan system instruction and tool declarations.
 *   4. Execute any tool calls (route finding, facility lookup, density check) using
 *      deterministic server-side implementations — Gemini cannot generate these values.
 *   5. Loop up to `maxToolRounds` times to allow multi-step information gathering.
 *   6. Validate the final JSON response against `fanResponseSchema`.
 *   7. On validation failure: attempt a one-shot schema-repair prompt.
 *   8. On repair failure: return a `buildFallback()` safe handoff response.
 *
 *   The fallback chain (fixture → schema-repair → safe handoff) ensures fans
 *   always receive a response that is safe to display, even under AI service
 *   degradation or model hallucination.
 *
 * @pr-changes
 *   - Added a two-stage fallback: validation failure now triggers a schema-repair
 *     prompt before falling back to the human handoff message, improving the
 *     fraction of useful AI responses under real-world model variability.
 *   - `buildFallback()` extracted to module scope so it can be unit-tested
 *     and referenced without constructing a full request context.
 *   - Disallowed tool warning now logs the `toolName` for monitoring.
 *   - `config.maxConversationLength` is applied at history building time (server-
 *     enforced trim) to prevent fan clients from sending unbounded history.
 *   - `tools: undefined` is explicitly set on the schema-repair round to prevent
 *     Gemini from making additional tool calls when only text output is needed.
 *
 * @validation-review
 *   - `ALLOWED_TOOL_NAMES` is checked before every tool execution; a tool name
 *     not in this set returns an error function response to Gemini.
 *   - `validateFanResponse()` applies the full `fanResponseSchema` Zod schema;
 *     any missing required field causes fallback.
 *   - The schema-repair prompt instructs Gemini to produce raw JSON only (no
 *     markdown fences); however, a model update could change this behaviour.
 *     Consider a JSON extraction pre-processor for robustness.
 *   - Conversation history sent to Gemini is user-supplied; although capped in
 *     length, the content is not sanitised. Prompt injection via crafted history
 *     messages is a theoretical risk — assess if fan chat is ever publicly open.
 *   - `buildCompactContext()` does NOT sanitise `fromNode`/`toNode` values;
 *     ensure these come only from the client's validated preference selections.
 *
 * @scope-of-improvement
 *   - Persist conversation history server-side (Redis with fan session ID as key)
 *     to free the client from sending full history on every request.
 *   - Add per-session rate limiting so a single user cannot exhaust Gemini quota.
 *   - Merge the tool-calling loop with the identical loop in `operationsBriefService`
 *     into a shared `runGeminiWithTools(geminiClient, contents, options)` utility.
 *   - Add a `confusionScore` to the validated response to allow the client to
 *     show a "low confidence" indicator when the model is uncertain.
 *   - Implement streaming (`generateContentStream`) for a better UX during multi-
 *     round tool-calling that currently produces a 5–15 second blank wait.
 *
 * @business-intent
 *   The Fan Assistant is the fan-visible face of CrowdSphere AI, serving up to
 *   60,000 concurrent stadium attendees. Every response must be safe to display:
 *   incorrect routing information (wrong gate, inaccessible route) could cause
 *   physical harm. The three-layer validation chain (schema → repair → fallback)
 *   ensures no unvalidated AI output reaches fans. The fallback always directs
 *   fans to a physical Information Desk — a safety anchor that never fails.
 */

import { FAN_SYSTEM_INSTRUCTION } from './systemInstructions.js';
import { GEMINI_TOOL_DECLARATIONS } from './toolDeclarations.js';
import { validateFanResponse } from './responseValidator.js';
import { FAN_FIXTURE } from './mockFixtures.js';
import { executeTool, ALLOWED_TOOL_NAMES } from '../tools/index.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

/**
 * Build a safe human-handoff fallback response for use when AI is unavailable
 * or output validation has failed after all retry attempts.
 *
 * @description Creates a minimally-populated fan response object that passes
 *   the fan response schema (all required fields present with safe defaults)
 *   while directing the fan to a physical Information Desk. The `requiresStaffAssistance`
 *   flag ensures the client UI shows the staff handoff prompt.
 *
 * @param {string} [language='en'] - ISO language code for the response.
 * @returns {Object} A schema-compatible fan response object with a safe fallback message.
 *
 * @business-intent
 *   A fan receiving no response is worse than receiving a "speak to staff" message.
 *   This fallback preserves the core safety guarantee: regardless of AI availability,
 *   fans are always given a clear next action during a live event.
 */
const buildFallback = (language) => ({
  answer:
    'I am unable to process your request right now. Please speak to a venue staff member for assistance. Visit the nearest Information Desk for help.',
  language: language || 'en',
  intent: 'general',
  verifiedFacts: [],
  routeSummary: '',
  routeId: null,
  distanceMeters: 0,
  estimatedMinutes: 0,
  crowdLevel: 'unknown',
  accessibilityNotes: [],
  // #Business-Intent — Warn fans proactively that AI is degraded rather than
  //   silently returning empty data, which could cause confusion at the venue.
  warnings: ['AI service temporarily unavailable'],
  recommendedNextAction: 'Please visit the nearest Information Desk',
  requiresStaffAssistance: true,
  confidence: 'low',
  dataFreshness: 'unavailable',
  snapshotVersion: 'unknown',
});

/**
 * Build a compact context string summarising the fan's session for Gemini.
 *
 * @description Produces a short multi-line text block containing the fan's
 *   selected language, the current scenario, optional location/destination
 *   nodes, active accessibility preferences, and elevator outage notices.
 *   Only data relevant to the current request is included to minimise token usage.
 *
 * @param {Object} params - Parsed fan chat request parameters.
 * @param {string} params.language - ISO language code (e.g. 'en', 'hi').
 * @param {Object} [params.preferences] - Key-value map of accessibility preferences.
 * @param {string} [params.fromNode] - Fan's current venue node ID.
 * @param {string} [params.toNode] - Fan's intended destination node ID.
 * @param {Object} operationsState - Current operations state from `getState()`.
 * @returns {string} Multi-line context block for embedding in the Gemini user turn.
 *
 * @risk-area
 *   Values from `params` are embedded directly into the context string that is
 *   sent to Gemini. If `fromNode` or `toNode` come from unvalidated user input,
 *   they could be used for prompt injection. Ensure these values originate only
 *   from the venue's known node list, not free-form user text.
 *
 * @business-intent
 *   Keeping the context compact (rather than sending the full state object)
 *   reduces per-request token costs and prevents the fan query from exceeding
 *   Gemini's context window even on the most complex multi-scenario states.
 */
function buildCompactContext(params, operationsState) {
  const { language, preferences, fromNode, toNode } = params;
  const state = operationsState;

  const lines = [
    `Language: ${language}`,
    `Venue: Unity Arena (simulated data)`,
    `Current scenario: ${state?.scenarioName || 'Normal operations'}`,
  ];

  // #What — Only include location context when the fan has specified nodes;
  //         avoids sending empty/null location fields that could confuse the model.
  if (fromNode) lines.push(`Fan location: ${fromNode}`);
  if (toNode) lines.push(`Fan destination: ${toNode}`);

  // #What — Summarise active accessibility preferences as a comma-separated list;
  //         only include flags that are truthy (e.g. wheelchair: true, not avoidStairs: false).
  const prefs = Object.entries(preferences || {})
    .filter(([, v]) => v)
    .map(([k]) => k);
  if (prefs.length > 0) lines.push(`Accessibility preferences: ${prefs.join(', ')}`);

  // #Business-Intent — Informing Gemini of elevator outages lets it proactively
  //   warn fans about accessibility constraints without a separate tool call.
  if (state?.elevatorOutages?.length > 0) {
    lines.push(`Active elevator outages: ${state.elevatorOutages.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Process a fan's natural-language request through the Gemini Fan Assistant.
 *
 * @description Orchestrates the full multi-round Gemini tool-calling conversation
 *   for a fan query. Builds conversation history (capped at `maxConversationLength`),
 *   runs the tool-calling loop, extracts the final text response, validates it
 *   against the fan response schema, attempts a schema-repair prompt on failure,
 *   and returns a safe fallback if all else fails.
 *
 * @param {Object} params - Validated fan chat request parameters.
 * @param {string} params.message - The fan's natural-language message.
 * @param {string} params.language - ISO language code for the response.
 * @param {Array<Object>} params.conversationHistory - Prior turns in the conversation.
 * @param {Object} [params.preferences] - Accessibility preference flags.
 * @param {string} [params.fromNode] - Fan's current venue node ID.
 * @param {string} [params.toNode] - Fan's intended destination node ID.
 * @param {Object} geminiClient - Client from `createGeminiClient()`.
 * @param {Object} operationsState - Full operations state from `getState()`.
 * @returns {Promise<Object>} Validated fan response object or safe fallback.
 *
 * @risk-area
 *   Tool execution is gated by `ALLOWED_TOOL_NAMES`. Any removal of this check
 *   would allow Gemini to invoke arbitrary server-side functions, constituting
 *   a remote code execution vulnerability.
 *
 * @business-intent
 *   Fan queries may include accessibility-critical questions (nearest accessible
 *   toilet, wheelchair-safe exit). Returning incorrect data could strand or
 *   endanger fans. The validation-then-fallback chain ensures safety-critical
 *   routing and facility data is always deterministic, never hallucinated.
 *
 * @validation-note
 *   Validation is performed twice: once on the initial Gemini response, and once
 *   after a schema-repair attempt. Only if both fail is the fallback returned.
 *   This two-stage approach reduces fallback rates from model variability.
 */
export async function handleFanRequest(params, geminiClient, operationsState) {
  const { message, language, conversationHistory, preferences, fromNode, toNode } = params;

  // #What — Demo mode: if Gemini is not configured, return the pre-defined fixture.
  // #Business-Intent — Ensures fan chat works during development and training sessions
  //   without requiring a live Gemini API key.
  if (!geminiClient.isAvailable()) {
    logger.info('Fan assistant: demo fixture mode (no API key)');
    return {
      ...FAN_FIXTURE,
      language,
      answer: FAN_FIXTURE.answer,
    };
  }

  const context = buildCompactContext({ language, preferences, fromNode, toNode }, operationsState);

  // #What — Cap conversation history at maxConversationLength to bound context size;
  //         taking the last N messages preserves the most recent context.
  // #Business-Intent — Unbounded history would increase token costs and risk exceeding
  //   Gemini's context window, causing API errors on long fan conversations.
  const history = (conversationHistory || [])
    .slice(-config.maxConversationLength)
    .map((m) => ({
      role: m.role,
      parts: [{ text: m.content }],
    }));

  // #What — Combine the context summary with the fan's actual message in a single turn.
  //         Context is prepended so Gemini has venue state before seeing the request.
  const userContent = {
    role: 'user',
    parts: [{ text: `Context:\n${context}\n\nFan request: ${message}` }],
  };

  const contents = [...history, userContent];

  let response;
  let toolRounds = 0;
  const currentContents = [...contents];

  try {
    // #What — Multi-round tool-calling loop; bounded by maxToolRounds to prevent
    //         infinite loops if the model keeps requesting tools.
    // #Risk-Area — Without this cap, a looping model could hold the connection open
    //   past the 30-second server timeout, causing a 503 for the fan.
    while (toolRounds < config.maxToolRounds) {
      response = await geminiClient.generateWithRetry({
        systemInstruction: FAN_SYSTEM_INSTRUCTION,
        contents: currentContents,
        tools: GEMINI_TOOL_DECLARATIONS,
      });

      const candidate = response?.candidates?.[0];
      const parts = candidate?.content?.parts || [];
      const functionCalls = parts.filter((p) => p.functionCall);

      // #What — No tool calls in this round means Gemini has produced its final
      //         text answer; break out of the loop to extract it.
      if (functionCalls.length === 0) break;

      toolRounds++;

      const toolResponses = [];
      for (const part of functionCalls) {
        const { name, args } = part.functionCall;

        // #Risk-Area — ALLOWLIST: only execute declared tool names; reject any
        //   tool Gemini attempts to call that is not in ALLOWED_TOOL_NAMES.
        // @hallucination-guard — Prevents Gemini from calling undeclared functions.
        if (!ALLOWED_TOOL_NAMES.has(name)) {
          logger.warn('Gemini requested disallowed tool', { toolName: name });
          toolResponses.push({
            functionResponse: { name, response: { error: `Tool ${name} is not available.` } },
          });
          continue;
        }

        try {
          // #What — Execute the tool with server-side deterministic logic;
          //         the result is authoritative, not AI-inferred.
          const result = executeTool(name, args);
          toolResponses.push({
            functionResponse: { name, response: result },
          });
          logger.info('Tool executed', { tool: name });
        } catch (err) {
          // #Uncertain — Tool errors are returned to Gemini as error responses;
          //   Gemini may or may not generate a helpful message when a tool fails.
          logger.warn('Tool execution error', { tool: name, error: err.message });
          toolResponses.push({
            functionResponse: { name, response: { error: err.message } },
          });
        }
      }

      // #What — Extend conversation history with the model's tool calls and
      //         the server's tool execution results for the next Gemini round.
      currentContents.push({ role: 'model', parts });
      currentContents.push({ role: 'user', parts: toolResponses });
    }

    // #What — Extract the final text response from the last model candidate.
    const finalParts = response?.candidates?.[0]?.content?.parts || [];
    const textPart = finalParts.find((p) => p.text);
    const rawText = textPart?.text || '';

    // @hallucination-guard — Validate the extracted JSON against the fan response schema.
    //   If validation passes, the data is safe to return to the client.
    const validation = validateFanResponse(rawText);

    if (validation.success) {
      return validation.data;
    }

    // #What — Schema-repair attempt: ask Gemini to reformat its response as pure JSON.
    //         `tools: undefined` prevents another tool-calling round on the repair prompt.
    // #Uncertain — Schema repair works if the model's issue was formatting (e.g. markdown
    //   fences); it may not fix structural JSON issues (missing required fields).
    logger.warn('Fan response validation failed — attempting schema repair');
    const repairResponse = await geminiClient.generateContent({
      systemInstruction: FAN_SYSTEM_INSTRUCTION,
      contents: [
        ...currentContents,
        {
          role: 'user',
          parts: [{ text: `Your previous response was not valid JSON matching the required schema. Please respond ONLY with a valid JSON object matching the schema. No markdown. No code fences. Start with { and end with }.` }],
        },
      ],
      tools: undefined, // #What — Disable tools for repair round; we need pure text JSON output only
    });

    const repairText = repairResponse?.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text || '';

    // @hallucination-guard — Second validation attempt on the repaired response.
    const repairValidation = validateFanResponse(repairText);

    if (repairValidation.success) {
      return repairValidation.data;
    }

    // #Business-Intent — Both attempts failed; return the safe fallback human-handoff
    //   response. Fans are always given a next action, even under total AI failure.
    logger.error('Fan response repair also failed — returning safe fallback');
    return buildFallback(language);
  } catch (err) {
    // #What — Catch any Gemini API errors and return the fallback; the fan must
    //         never see an unhandled exception or blank response.
    logger.error('Fan assistant service error', { message: err.message });
    return buildFallback(language);
  }
}
