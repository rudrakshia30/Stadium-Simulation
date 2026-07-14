/**
 * Fan assistant controller.
 * Handles AI chat and deterministic route requests.
 *
 * @module controllers/fanController
 */

import { handleFanRequest } from '../ai/fanAssistantService.js';
import { calculateRoute } from '../tools/routingEngine.js';
import { fanChatSchema, routeRequestSchema } from '../validators/fanRequestSchema.js';
import { getState } from '../data/operationsState.js';
import { ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

// Module-level gemini client (injected at startup)
let _geminiClient = null;

/**
 * Inject the Gemini client.
 * @param {Object} client
 */
export function setGeminiClient(client) {
  _geminiClient = client;
}

/**
 * POST /api/fan/chat
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {Function} next
 */
export async function chat(req, res, next) {
  try {
    const parsed = fanChatSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(`Invalid request: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
    }

    const operationsState = getState();
    const startTime = Date.now();

    const aiResponse = await handleFanRequest(parsed.data, _geminiClient, operationsState);

    logger.info('Fan chat processed', {
      language: parsed.data.language,
      durationMs: Date.now() - startTime,
      requestId: req.id,
    });

    res.json({
      success: true,
      data: aiResponse,
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/fan/route
 * Deterministic route calculation (no AI).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {Function} next
 */
export async function getRoute(req, res, next) {
  try {
    const parsed = routeRequestSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError(`Invalid request: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
    }

    const state = getState();
    const startTime = Date.now();

    const route = calculateRoute(
      {
        from: parsed.data.from,
        to: parsed.data.to,
        ...parsed.data.preferences,
        elevatorOutages: state.elevatorOutages,
        closedEdges: state.closedEdges,
      },
      state.crowd,
    );

    logger.info('Route calculated', { from: parsed.data.from, to: parsed.data.to, durationMs: Date.now() - startTime });

    res.json({
      success: true,
      data: route,
      meta: {
        calculationTimeMs: Date.now() - startTime,
        fromCache: false,
        snapshotVersion: state.snapshotVersion,
      },
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}
