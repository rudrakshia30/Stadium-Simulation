/**
 * Fan AI assistant service.
 * Orchestrates Gemini function-calling with deterministic tools.
 * Returns validated, safe responses only.
 *
 * @module ai/fanAssistantService
 */

import { FAN_SYSTEM_INSTRUCTION } from './systemInstructions.js';
import { GEMINI_TOOL_DECLARATIONS } from './toolDeclarations.js';
import { validateFanResponse } from './responseValidator.js';
import { FAN_FIXTURE } from './mockFixtures.js';
import { executeTool, ALLOWED_TOOL_NAMES } from '../tools/index.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

/** Safe fallback when AI is unavailable or response is invalid */
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
  warnings: ['AI service temporarily unavailable'],
  recommendedNextAction: 'Please visit the nearest Information Desk',
  requiresStaffAssistance: true,
  confidence: 'low',
  dataFreshness: 'unavailable',
  snapshotVersion: 'unknown',
});

/**
 * Build a compact context summary (NOT the full dataset).
 * Only includes information relevant to the current request.
 *
 * @param {Object} params
 * @param {string} params.language
 * @param {Object} params.preferences
 * @param {string} [params.fromNode]
 * @param {string} [params.toNode]
 * @param {Object} operationsState
 * @returns {string}
 */
function buildCompactContext(params, operationsState) {
  const { language, preferences, fromNode, toNode } = params;
  const state = operationsState;

  const lines = [
    `Language: ${language}`,
    `Venue: Unity Arena (simulated data)`,
    `Current scenario: ${state?.scenarioName || 'Normal operations'}`,
  ];

  if (fromNode) lines.push(`Fan location: ${fromNode}`);
  if (toNode) lines.push(`Fan destination: ${toNode}`);

  const prefs = Object.entries(preferences || {})
    .filter(([, v]) => v)
    .map(([k]) => k);
  if (prefs.length > 0) lines.push(`Accessibility preferences: ${prefs.join(', ')}`);

  if (state?.elevatorOutages?.length > 0) {
    lines.push(`Active elevator outages: ${state.elevatorOutages.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Process a fan assistant request through Gemini function calling.
 *
 * @param {Object} params
 * @param {string} params.message - Fan's message
 * @param {string} params.language - Language code
 * @param {Array<Object>} params.conversationHistory - Previous messages
 * @param {Object} params.preferences - Accessibility preferences
 * @param {string} [params.fromNode] - Starting node
 * @param {string} [params.toNode] - Destination node
 * @param {Object} geminiClient - Gemini client instance
 * @param {Object} operationsState - Current operations state
 * @returns {Promise<Object>} Validated fan response
 */
export async function handleFanRequest(params, geminiClient, operationsState) {
  const { message, language, conversationHistory, preferences, fromNode, toNode } = params;

  // Demo mode — return fixture if Gemini is not configured
  if (!geminiClient.isAvailable()) {
    logger.info('Fan assistant: demo fixture mode (no API key)');
    return {
      ...FAN_FIXTURE,
      language,
      answer: FAN_FIXTURE.answer,
    };
  }

  const context = buildCompactContext({ language, preferences, fromNode, toNode }, operationsState);

  // Build conversation history for Gemini (capped at maxConversationLength)
  const history = (conversationHistory || [])
    .slice(-config.maxConversationLength)
    .map((m) => ({
      role: m.role,
      parts: [{ text: m.content }],
    }));

  const userContent = {
    role: 'user',
    parts: [{ text: `Context:\n${context}\n\nFan request: ${message}` }],
  };

  const contents = [...history, userContent];

  let response;
  let toolRounds = 0;
  const currentContents = [...contents];

  try {
    // Tool-calling loop (max 3 rounds)
    while (toolRounds < config.maxToolRounds) {
      response = await geminiClient.generateWithRetry({
        systemInstruction: FAN_SYSTEM_INSTRUCTION,
        contents: currentContents,
        tools: GEMINI_TOOL_DECLARATIONS,
      });

      const candidate = response?.candidates?.[0];
      const parts = candidate?.content?.parts || [];
      const functionCalls = parts.filter((p) => p.functionCall);

      if (functionCalls.length === 0) break; // Final answer

      toolRounds++;

      // Execute each tool call
      const toolResponses = [];
      for (const part of functionCalls) {
        const { name, args } = part.functionCall;

        // Allowlist check
        if (!ALLOWED_TOOL_NAMES.has(name)) {
          logger.warn('Gemini requested disallowed tool', { toolName: name });
          toolResponses.push({
            functionResponse: { name, response: { error: `Tool ${name} is not available.` } },
          });
          continue;
        }

        try {
          const result = executeTool(name, args);
          toolResponses.push({
            functionResponse: { name, response: result },
          });
          logger.info('Tool executed', { tool: name });
        } catch (err) {
          logger.warn('Tool execution error', { tool: name, error: err.message });
          toolResponses.push({
            functionResponse: { name, response: { error: err.message } },
          });
        }
      }

      // Add model response and tool results to conversation
      currentContents.push({ role: 'model', parts });
      currentContents.push({ role: 'user', parts: toolResponses });
    }

    // Extract final text response
    const finalParts = response?.candidates?.[0]?.content?.parts || [];
    const textPart = finalParts.find((p) => p.text);
    const rawText = textPart?.text || '';

    // Validate response
    const validation = validateFanResponse(rawText);

    if (validation.success) {
      return validation.data;
    }

    // Retry once with schema-repair instruction
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
      tools: undefined, // No tools on repair
    });

    const repairText = repairResponse?.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text || '';
    const repairValidation = validateFanResponse(repairText);

    if (repairValidation.success) {
      return repairValidation.data;
    }

    logger.error('Fan response repair also failed — returning safe fallback');
    return buildFallback(language);
  } catch (err) {
    logger.error('Fan assistant service error', { message: err.message });
    return buildFallback(language);
  }
}
