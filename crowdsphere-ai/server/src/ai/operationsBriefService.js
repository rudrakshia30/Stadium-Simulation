/**
 * Operations brief AI service.
 * Generates a structured Gemini operations brief from the current state.
 * humanApprovalRequired is always enforced server-side.
 *
 * @module ai/operationsBriefService
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
 * Build a compact operational snapshot for Gemini context.
 * Never sends the full venue dataset — only a summary.
 *
 * @param {Object} state - Current operations state
 * @returns {string}
 */
function buildOpsContext(state) {
  const { crowd, transport, elevatorOutages, scenarioName } = state;
  const risk = calculateOverallRisk(crowd, transport);

  const zoneSummaries = crowd.zones
    .map((z) => `  - ${z.name}: ${z.occupancyPct}% occupancy (${z.densityLevel}), queue ${z.queueMinutes}min${z.accessibilityObstruction ? ' [ACCESSIBILITY OBSTRUCTION]' : ''}`)
    .join('\n');

  const incidentSummaries = crowd.incidents
    .filter((i) => i.status !== 'resolved')
    .map((i) => `  - [${i.severity.toUpperCase()}] ${i.type} in ${i.zone}: ${i.description}`)
    .join('\n');

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
 * Generate a Gemini operations brief.
 *
 * @param {Object} geminiClient
 * @param {Object} operationsState - Current state from getState()
 * @returns {Promise<Object>} Validated ops response
 */
export async function generateOperationsBrief(geminiClient, operationsState) {
  if (!geminiClient.isAvailable()) {
    logger.info('Operations brief: demo fixture mode (no API key)');
    return { ...OPS_BRIEF_FIXTURE, generatedAt: new Date().toISOString() };
  }

  const context = buildOpsContext(operationsState);

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
  const currentContents = [...contents];

  try {
    while (toolRounds < config.maxToolRounds) {
      response = await geminiClient.generateWithRetry({
        systemInstruction: OPS_SYSTEM_INSTRUCTION,
        contents: currentContents,
        tools: GEMINI_TOOL_DECLARATIONS,
      });

      const parts = response?.candidates?.[0]?.content?.parts || [];
      const functionCalls = parts.filter((p) => p.functionCall);

      if (functionCalls.length === 0) break;
      toolRounds++;

      const toolResponses = [];
      for (const part of functionCalls) {
        const { name, args } = part.functionCall;
        if (!ALLOWED_TOOL_NAMES.has(name)) {
          toolResponses.push({ functionResponse: { name, response: { error: 'Tool not available' } } });
          continue;
        }
        try {
          toolResponses.push({ functionResponse: { name, response: executeTool(name, args) } });
        } catch (err) {
          toolResponses.push({ functionResponse: { name, response: { error: err.message } } });
        }
      }

      currentContents.push({ role: 'model', parts });
      currentContents.push({ role: 'user', parts: toolResponses });
    }

    const textPart = response?.candidates?.[0]?.content?.parts?.find((p) => p.text);
    const rawText = textPart?.text || '';

    const validation = validateOpsResponse(rawText);
    if (validation.success) return validation.data;

    logger.warn('Ops brief validation failed — returning fixture');
    return { ...OPS_BRIEF_FIXTURE, generatedAt: new Date().toISOString() };
  } catch (err) {
    logger.error('Operations brief service error', { message: err.message });
    return { ...OPS_BRIEF_FIXTURE, generatedAt: new Date().toISOString() };
  }
}
