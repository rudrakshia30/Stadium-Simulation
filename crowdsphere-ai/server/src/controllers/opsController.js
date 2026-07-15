/**
 * Operations Command Centre controller.
 * Handles login, logout, scenario management, and AI brief generation.
 *
 * @module controllers/opsController
 */

import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { timingSafeEqual } from '../utils/crypto.js';
import { ValidationError, AuthError } from '../utils/errors.js';
import { loginSchema, scenarioSchema, briefSchema, announcementSchema } from '../validators/opsRequestSchema.js';
import { getState, setState } from '../data/operationsState.js';
import { generateOperationsBrief } from '../ai/operationsBriefService.js';
import { generateAnnouncement } from '../ai/announcementService.js';
import { calculateOverallRisk } from '../tools/riskEngine.js';
import { getVolunteerAvailability } from '../tools/volunteerTracker.js';
import { logger } from '../utils/logger.js';

let _geminiClient = null;

/**
 * Inject the Gemini client.
 * @param {Object} client
 */
export function setGeminiClient(client) {
  _geminiClient = client;
}

/**
 * POST /api/ops/login
 */
export async function login(req, res, next) {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid login request');
    }

    const { accessCode } = parsed.data;
    const isValid = timingSafeEqual(accessCode, config.opsAccessCode);

    if (!isValid) {
      logger.warn('Failed ops login attempt', { requestId: req.id });
      throw new AuthError('Invalid access code');
    }

    const token = jwt.sign({ role: 'operations' }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    });

    res.cookie('ops_token', token, {
      httpOnly: true,
      sameSite: config.isProduction ? 'none' : 'strict',
      secure: config.isProduction,
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    logger.info('Ops login successful', { requestId: req.id });

    res.json({
      success: true,
      data: { token, role: 'operations', expiresIn: config.jwtExpiresIn },
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/ops/logout
 */
export function logout(req, res) {
  res.clearCookie('ops_token', {
    httpOnly: true,
    sameSite: config.isProduction ? 'none' : 'strict',
    secure: config.isProduction
  });
  res.json({ success: true, data: { message: 'Logged out successfully' }, requestId: req.id });
}

/**
 * GET /api/ops/snapshot
 */
export function getSnapshot(req, res, next) {
  try {
    const state = getState();
    const risk = calculateOverallRisk(state.crowd, state.transport);
    const volunteers = getVolunteerAvailability();

    const transportDisruptions = state.transport.filter((t) => t.status !== 'operational').length;
    const accessibilityDisruptions =
      state.crowd.zones.filter((z) => z.accessibilityObstruction).length +
      state.elevatorOutages.length;

    const highRiskZones = risk.zoneRisks.filter((z) => z.score >= 50);
    const longestQueue = state.crowd.zones.reduce(
      (max, z) => Math.max(max, z.queueMinutes || 0), 0,
    );

    res.json({
      success: true,
      data: {
        scenarioId: state.scenarioId,
        scenarioName: state.scenarioName,
        scenarioDescription: state.scenarioDescription,
        snapshotVersion: state.snapshotVersion,
        snapshotTimestamp: state.snapshotTimestamp,
        crowd: state.crowd,
        transport: state.transport,
        elevatorOutages: state.elevatorOutages,
        metrics: {
          stadiumOccupancyPct: Math.round(
            state.crowd.zones.reduce((sum, z) => sum + z.occupancyPct, 0) / state.crowd.zones.length,
          ),
          overallRisk: risk.category,
          overallRiskScore: risk.score,
          highestRiskZone: risk.highestRiskZone?.zoneName || 'None',
          highRiskZoneCount: highRiskZones.length,
          longestQueueMinutes: longestQueue,
          activeIncidentCount: state.crowd.incidents.filter((i) => i.status !== 'resolved').length,
          availableVolunteers: volunteers.totalAvailable,
          volunteerShortage: volunteers.shortage,
          accessibilityDisruptions,
          transportDisruptions,
        },
        geminiAvailable: _geminiClient?.isAvailable() ?? false,
      },
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/ops/scenario
 */
export function setScenario(req, res, next) {
  try {
    const parsed = scenarioSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(`Invalid scenario: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
    }

    const newState = setState(parsed.data.scenarioId);
    logger.info('Scenario changed', { scenarioId: parsed.data.scenarioId, requestId: req.id });

    res.json({
      success: true,
      data: {
        scenarioId: newState.scenarioId,
        scenarioName: newState.scenarioName,
        snapshotVersion: newState.snapshotVersion,
      },
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/ops/brief
 */
export async function generateBrief(req, res, next) {
  try {
    const parsed = briefSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid brief request');
    }

    const state = getState();
    const startTime = Date.now();

    const brief = await generateOperationsBrief(_geminiClient, state);

    logger.info('Operations brief generated', { durationMs: Date.now() - startTime, requestId: req.id });

    res.json({
      success: true,
      data: brief,
      meta: {
        aiRequestTimeMs: Date.now() - startTime,
        geminiAvailable: _geminiClient?.isAvailable() ?? false,
        snapshotVersion: state.snapshotVersion,
      },
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/ops/announcement
 */
export async function createAnnouncement(req, res, next) {
  try {
    const parsed = announcementSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(`Invalid announcement request: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
    }

    const state = getState();
    const startTime = Date.now();

    const announcement = await generateAnnouncement(parsed.data, _geminiClient, state);

    logger.info('Announcement generated', { audience: parsed.data.audience, language: parsed.data.language, requestId: req.id });

    res.json({
      success: true,
      data: announcement,
      meta: { aiRequestTimeMs: Date.now() - startTime, geminiAvailable: _geminiClient?.isAvailable() ?? false },
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}
