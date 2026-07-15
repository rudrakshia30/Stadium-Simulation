/**
 * @module tests/toolsAndUtils.test
 * @description Comprehensive unit tests for utilities, middleware, deterministic tools,
 *   API registry, and AI client factories. Designed to push test coverage well
 *   above the vitest/coverage thresholds.
 *
 * @pr-changes
 *   - Added extensive test coverage for secondary helpers and registry execution.
 *
 * @validation-review
 *   - Validates that mock parameters are type safe.
 *
 * @scope-of-improvement
 *   - Add property-based testing.
 *
 * @business-intent
 *   Validates that all support modules, routing utilities, and secondary tools
 *   perform correctly across all edge cases (missing keys, unknown IDs, invalid enums).
 */

import { describe, it, expect, vi } from 'vitest';
import { generateRequestId } from '../utils/requestId.js';
import { getTransportOptions } from '../tools/transportAdvisor.js';
import { findFacilities, getAvailableFacilityTypes } from '../tools/facilityFinder.js';
import { compareResponseOptions } from '../tools/responseComparator.js';
import { getVolunteerAvailability } from '../tools/volunteerTracker.js';
import { getIncidentPlaybook } from '../tools/incidentPlaybook.js';
import { executeTool } from '../tools/index.js';
import { createGeminiClient } from '../ai/geminiClient.js';
import { requireAuth } from '../middleware/auth.js';
import { resetState, setState, getState } from '../data/operationsState.js';
import { generateAnnouncement } from '../ai/announcementService.js';
import { handleFanRequest } from '../ai/fanAssistantService.js';
import { generateOperationsBrief } from '../ai/operationsBriefService.js';
import { timingSafeEqual } from '../utils/crypto.js';
import {
  ValidationError,
  AuthError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  AIServiceError,
  AIValidationError,
} from '../utils/errors.js';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

describe('requestId utility', () => {
  it('should generate a unique 16-character hex request ID', () => {
    // #What — Test requestId format and uniqueness.
    const id1 = generateRequestId();
    const id2 = generateRequestId();
    expect(id1).toHaveLength(16);
    expect(id1).not.toBe(id2);
    expect(/^[0-9a-fA-F]{16}$/.test(id1)).toBe(true);
  });
});

describe('transportAdvisor tool', () => {
  it('should return transport options matching preferences', () => {
    // #What — Filter transport options by accessibility preference.
    const results = getTransportOptions({ accessible: true }, [
      { id: 'metro-main', status: 'operational' },
      { id: 'bus-terminal', status: 'disrupted' }
    ]);
    expect(results.length).toBeGreaterThan(0);
    results.forEach((r) => expect(r.accessible).toBe(true));
  });

  it('should filter by transport type', () => {
    // #What — Filter transport by type (e.g. metro).
    const results = getTransportOptions({ type: 'metro' }, [
      { id: 'metro-main', status: 'operational' }
    ]);
    expect(results.length).toBeGreaterThan(0);
    results.forEach((r) => expect(r.type).toBe('metro'));
  });

  it('should sort operational options first', () => {
    // #What — Verify disrupted routes are pushed below operational ones.
    const results = getTransportOptions({}, [
      { id: 'metro-main', status: 'disrupted', walkMinutes: 5 },
      { id: 'bus-terminal', status: 'operational', walkMinutes: 10 }
    ]);
    expect(results[0].status).toBe('operational');
  });
});

describe('facilityFinder tool', () => {
  it('should find facilities matching type', () => {
    // #What — Query facilities of toilet type.
    const results = findFacilities('toilet');
    expect(results.length).toBeGreaterThan(0);
    results.forEach((f) => expect(f.type).toBe('toilet'));
  });

  it('should filter by accessible facilities', () => {
    // #What — Query accessible facilities only.
    const results = findFacilities('toilet', { accessible: true });
    results.forEach((f) => expect(f.accessible).toBe(true));
  });

  it('should sort by nearZone proximity', () => {
    // #What — Query facilities sorting a target zone to the front.
    const results = findFacilities('toilet', { nearZone: 'zone-east-concourse' });
    expect(results[0].zone).toBe('zone-east-concourse');
  });

  it('should return unique facility types available', () => {
    const types = getAvailableFacilityTypes();
    expect(types).toContain('toilet');
    expect(types).toContain('medical');
  });
});

describe('responseComparator tool', () => {
  const mockCrowdState = {
    incidents: [
      { id: 'inc-1', type: 'crowd-surge', zone: 'zone-north-concourse', severity: 'critical' },
      { id: 'inc-2', type: 'medical', zone: 'zone-east-concourse', severity: 'moderate' }
    ]
  };

  it('should compare response options for a critical active incident', () => {
    // #What — Verify full-immediate, staged-response, and monitor tradeoffs are compared.
    const results = compareResponseOptions('inc-1', mockCrowdState);
    expect(results.length).toBe(2); // Critical incident does not include "Monitor - Await Escalation"
    expect(results[0].option).toBe('full-immediate');
    expect(results[0].humanApprovalRequired).toBe(true);
  });

  it('should compare response options for a moderate active incident', () => {
    const results = compareResponseOptions('inc-2', mockCrowdState);
    expect(results.length).toBe(3); // Includes "Monitor - Await Escalation"
  });

  it('should return safe fallback if incident is not found', () => {
    const results = compareResponseOptions('invalid-id', mockCrowdState);
    expect(results).toHaveLength(1);
    expect(results[0].option).toBe('monitor');
  });
});

describe('volunteerTracker tool', () => {
  it('should compute volunteer coverage and shortage per zone', () => {
    // #What — Verify shortage detection.
    const results = getVolunteerAvailability('zone-north-concourse', {
      'zone-north-concourse': { total: 10, available: 3 } // 30% coverage ratio < MIN_COVERAGE
    });
    expect(results.shortage).toBe(true);
    expect(results.zones[0].status).toBe('below-threshold');
  });
});

describe('incidentPlaybook tool', () => {
  it('should retrieve response playbook by incident type', () => {
    const playbook = getIncidentPlaybook('medical');
    expect(playbook.type).toBe('medical');
    expect(playbook.requiredRoles).toContain('medical-team');
  });

  it('should return general procedure fallback for unknown type', () => {
    const playbook = getIncidentPlaybook('alien-invasion');
    expect(playbook.requiredRoles).toContain('operations-manager');
    expect(playbook.note).toContain('No specific playbook found');
  });
});

describe('executeTool registry runner', () => {
  it('should successfully validate and run registered tools', () => {
    // #What — executeTool wraps schema check and function dispatch.
    const result = executeTool('getZoneStatus', { zoneId: 'zone-north-concourse' });
    expect(result.id).toBe('zone-north-concourse');
  });

  it('should throw error for invalid arguments', () => {
    expect(() => executeTool('getZoneStatus', { zoneId: 12345 })).toThrow();
  });

  it('should throw error for unregistered tool name', () => {
    expect(() => executeTool('hackTheSystem', {})).toThrow();
  });

  // #What — Test all registered tools to maximize coverage of registry wrappers.
  it('should run getVenueRoute tool via executeTool', () => {
    const result = executeTool('getVenueRoute', {
      from: 'gate-a',
      to: 'zone-north-concourse',
      preferences: { wheelchair: false }
    });
    expect(result.verified).toBe(true);
  });

  it('should run getAccessibleRoute tool via executeTool', () => {
    const result = executeTool('getAccessibleRoute', {
      from: 'gate-e',
      to: 'zone-north-concourse',
      preferences: {}
    });
    expect(result.verified).toBe(true);
  });

  it('should run getFacilityLocations tool via executeTool', () => {
    const result = executeTool('getFacilityLocations', {
      type: 'toilet',
      limit: 2
    });
    expect(result.length).toBeGreaterThan(0);
  });

  it('should run getTransportOptions tool via executeTool', () => {
    const result = executeTool('getTransportOptions', {
      type: 'metro'
    });
    expect(result.length).toBeGreaterThan(0);
  });

  it('should run getCurrentOperationsSnapshot tool via executeTool', () => {
    const result = executeTool('getCurrentOperationsSnapshot', {});
    expect(result.snapshotVersion).toBeDefined();
  });

  it('should run calculateZoneRisk tool via executeTool', () => {
    const result = executeTool('calculateZoneRisk', {
      zoneId: 'zone-north-concourse'
    });
    expect(result.score).toBeDefined();
  });

  it('should run getIncidentPlaybook tool via executeTool', () => {
    const result = executeTool('getIncidentPlaybook', {
      incidentType: 'medical'
    });
    expect(result.requiredRoles).toBeDefined();
  });

  it('should run getVolunteerAvailability tool via executeTool', () => {
    const result = executeTool('getVolunteerAvailability', {
      zone: 'zone-north-concourse'
    });
    expect(result.totalAvailable).toBeDefined();
  });

  it('should run compareResponseOptions tool via executeTool', () => {
    const result = executeTool('compareResponseOptions', {
      incidentId: 'inc-1'
    });
    expect(result).toBeDefined();
  });
});

describe('geminiClient factory', () => {
  it('should report as unavailable when API key is empty', () => {
    const client = createGeminiClient('', 'gemini-2.5-flash');
    expect(client.isAvailable()).toBe(false);
  });

  it('should throw AIServiceError on generateContent calls when unavailable', async () => {
    const client = createGeminiClient('', 'gemini-2.5-flash');
    await expect(client.generateContent({ systemInstruction: '', contents: [] })).rejects.toThrow(
      'Gemini is not configured'
    );
  });

  it('should throw AIServiceError on generateWithRetry calls when unavailable', async () => {
    const client = createGeminiClient('', 'gemini-2.5-flash');
    await expect(client.generateWithRetry({ systemInstruction: '', contents: [] })).rejects.toThrow(
      'Gemini is not configured'
    );
  });
});

describe('requireAuth middleware', () => {
  it('should return 401 AuthError if no ops_token is present in cookies', async () => {
    const req = { cookies: {}, headers: {} };
    const res = {};
    const next = vi.fn();

    await requireAuth(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(AuthError));
  });

  it('should return 401 AuthError if JWT verification fails', async () => {
    const req = { cookies: { ops_token: 'invalid-jwt-token' }, headers: {} };
    const res = {};
    const next = vi.fn();

    await requireAuth(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(AuthError));
  });

  it('should call next() and attach user details on valid token', async () => {
    const token = jwt.sign({ role: 'operations' }, config.jwtSecret);
    const req = { cookies: { ops_token: token }, headers: {} };
    const res = {};
    const next = vi.fn();

    await requireAuth(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toEqual({ role: 'operations' });
  });

  it('should call next() on valid token in Authorization header', async () => {
    const token = jwt.sign({ role: 'operations' }, config.jwtSecret);
    const req = { cookies: {}, headers: { authorization: `Bearer ${token}` } };
    const res = {};
    const next = vi.fn();

    await requireAuth(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('should return 401 AuthError on expired token', async () => {
    const token = jwt.sign({ role: 'operations' }, config.jwtSecret, { expiresIn: '-1s' });
    const req = { cookies: { ops_token: token }, headers: {} };
    const res = {};
    const next = vi.fn();

    await requireAuth(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Session expired. Please log in again.'
    }));
  });
});

describe('custom AppError classes', () => {
  it('should instantiate and throw all AppError subclasses', () => {
    // #What — Cover constructors and HTTP status codes for all AppError subclasses.
    const errs = [
      new ValidationError('msg'),
      new AuthError('msg'),
      new ForbiddenError('msg'),
      new NotFoundError('msg'),
      new RateLimitError('msg'),
      new AIServiceError('msg'),
      new AIValidationError('msg')
    ];
    errs.forEach((e) => {
      expect(e.message).toBe('msg');
      expect(e.isOperational).toBe(true);
    });
  });
});

describe('operationsState controls', () => {
  it('should switch scenarios and reset state', () => {
    // #What — Cover state switching logic.
    setState('gate-d-surge');
    expect(getState().scenarioId).toBe('gate-d-surge');
    resetState();
    expect(getState().scenarioId).toBe('normal-entry');
  });
});

describe('timingSafeEqual in crypto.js', () => {
  it('should return false if either argument is not a string', () => {
    expect(timingSafeEqual(123, 'string')).toBe(false);
    expect(timingSafeEqual('string', null)).toBe(false);
  });
});

describe('AI Services with active mock client', () => {
  // #What — Setup an available mock Gemini client that returns structured JSON strings.
  const availableClient = {
    isAvailable: () => true,
    generateContent: vi.fn(),
    generateWithRetry: vi.fn().mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  announcement: 'Attention fans: proceed normally.',
                  language: 'en',
                  audience: 'fans',
                  tone: 'informational',
                  characterCount: 33,
                  humanApprovalRequired: true,
                  // Fan fields:
                  answer: 'Here is your route to Section 214.',
                  intent: 'navigation',
                  verifiedFacts: [],
                  routeSummary: '',
                  routeId: null,
                  distanceMeters: 0,
                  estimatedMinutes: 0,
                  crowdLevel: 'low',
                  accessibilityNotes: [],
                  warnings: [],
                  recommendedNextAction: '',
                  requiresStaffAssistance: false,
                  confidence: 'high',
                  dataFreshness: '',
                  snapshotVersion: 'v1.0.0',
                  // Ops fields:
                  generatedAt: new Date().toISOString(),
                  overallRisk: 'low',
                  executiveSummary: 'Operations are running normally.',
                  priorities: [],
                  fanCommunication: { language: 'en', message: 'Welcome!' },
                  volunteerInstructions: [],
                  uncertainties: [],
                  missingInformation: []
                })
              }
            ]
          }
        }
      ]
    })
  };

  it('should successfully run generateAnnouncement with active client', async () => {
    // #What — Trigger try/catch branches and validation success branches in announcementService.
    const state = getState();
    const result = await generateAnnouncement(
      {
        audience: 'fans',
        language: 'en',
        tone: 'informational',
        maxLength: 200,
        incidentId: 'inc-1',
        recommendationText: 'Proceed normally'
      },
      availableClient,
      state
    );
    expect(result.announcement).toBe('Attention fans: proceed normally.');
  });

  it('should successfully run handleFanRequest with active client', async () => {
    const state = getState();
    const result = await handleFanRequest(
      {
        message: 'Hello',
        language: 'en',
        conversationHistory: [],
        preferences: {}
      },
      availableClient,
      state
    );
    expect(result.answer).toBe('Here is your route to Section 214.');
  });

  it('should successfully run generateOperationsBrief with active client', async () => {
    const state = getState();
    const result = await generateOperationsBrief(
      availableClient,
      state
    );
    expect(result.overallRisk).toBe('low');
  });
});

describe('AI Services with active mock client returning tool calls first', () => {
  it('should execute multi-round tool calling loop in generateOperationsBrief', async () => {
    const state = getState();
    const mockFunctionCallClient = {
      isAvailable: () => true,
      generateWithRetry: vi.fn()
        .mockResolvedValueOnce({
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: 'getZoneStatus',
                      args: { zoneId: 'zone-north-concourse' }
                    }
                  }
                ]
              }
            }
          ]
        })
        .mockResolvedValueOnce({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      generatedAt: new Date().toISOString(),
                      overallRisk: 'low',
                      executiveSummary: 'All operational areas clear.',
                      priorities: [],
                      fanCommunication: { language: 'en', message: 'Hello' },
                      volunteerInstructions: [],
                      uncertainties: [],
                      missingInformation: [],
                      confidence: 'high',
                      humanApprovalRequired: true
                    })
                  }
                ]
              }
            }
          ]
        })
    };

    const result = await generateOperationsBrief(mockFunctionCallClient, state);
    expect(result.overallRisk).toBe('low');
    expect(mockFunctionCallClient.generateWithRetry).toHaveBeenCalledTimes(2);
  });

  it('should execute multi-round tool calling loop in handleFanRequest', async () => {
    const state = getState();
    const mockFunctionCallClient = {
      isAvailable: () => true,
      generateWithRetry: vi.fn()
        .mockResolvedValueOnce({
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: 'getVenueRoute',
                      args: { from: 'gate-a', to: 'zone-north-concourse' }
                    }
                  }
                ]
              }
            }
          ]
        })
        .mockResolvedValueOnce({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      answer: 'Here is your route.',
                      language: 'en',
                      intent: 'navigation',
                      verifiedFacts: [],
                      routeSummary: '',
                      routeId: null,
                      distanceMeters: 0,
                      estimatedMinutes: 0,
                      crowdLevel: 'low',
                      accessibilityNotes: [],
                      warnings: [],
                      recommendedNextAction: '',
                      requiresStaffAssistance: false,
                      confidence: 'high',
                      dataFreshness: '',
                      snapshotVersion: 'v1.0.0'
                    })
                  }
                ]
              }
            }
          ]
        })
    };

    const result = await handleFanRequest(
      { message: 'Route me', language: 'en', conversationHistory: [], preferences: {} },
      mockFunctionCallClient,
      state
    );
    expect(result.answer).toBe('Here is your route.');
    expect(mockFunctionCallClient.generateWithRetry).toHaveBeenCalledTimes(2);
  });
});
