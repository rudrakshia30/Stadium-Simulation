/**
 * Unit tests for AI response validator.
 */
import { describe, it, expect } from 'vitest';
import { validateFanResponse, validateOpsResponse, validateAnnouncementResponse } from '../ai/responseValidator.js';

const validFanResponse = {
  answer: 'Here is your route to Section 214.',
  language: 'en',
  intent: 'navigation',
  verifiedFacts: ['Route calculated by venue routing engine'],
  routeSummary: 'Gate B → East Concourse → Section 214',
  routeId: 'abc-123',
  distanceMeters: 350,
  estimatedMinutes: 5,
  crowdLevel: 'low',
  accessibilityNotes: ['Step-free route available'],
  warnings: [],
  recommendedNextAction: 'Proceed to Gate B',
  requiresStaffAssistance: false,
  confidence: 'high',
  dataFreshness: 'Live simulated data',
  snapshotVersion: 'v1.0.0',
};

const validOpsResponse = {
  generatedAt: new Date().toISOString(),
  overallRisk: 'moderate',
  executiveSummary: 'Operations are running normally.',
  priorities: [
    {
      rank: 1,
      title: 'Gate A Queue',
      severity: 'low',
      affectedZones: ['zone-gate-a-plaza'],
      verifiedEvidence: ['Queue: 8 minutes'],
      recommendedActions: ['Monitor queue'],
      rationale: 'Self-resolving.',
      responsibleRole: 'steward',
      targetResponseMinutes: 15,
      humanApprovalRequired: true,
    },
  ],
  fanCommunication: { language: 'en', message: 'Welcome!' },
  volunteerInstructions: ['Stand by at Gate A.'],
  uncertainties: [],
  missingInformation: [],
  confidence: 'high',
  humanApprovalRequired: true,
};

const validAnnouncement = {
  announcement: 'Please proceed to Gate B.',
  language: 'en',
  audience: 'fans',
  tone: 'informational',
  characterCount: 30,
  humanApprovalRequired: true,
};

describe('validateFanResponse', () => {
  it('should pass valid fan response', () => {
    const result = validateFanResponse(JSON.stringify(validFanResponse));
    expect(result.success).toBe(true);
    expect(result.data.answer).toBe(validFanResponse.answer);
  });

  it('should pass valid fan response as object', () => {
    const result = validateFanResponse(validFanResponse);
    expect(result.success).toBe(true);
  });

  it('should fail with missing required field', () => {
    const withoutAnswer = { ...validFanResponse };
    delete withoutAnswer.answer;
    const result = validateFanResponse(withoutAnswer);
    expect(result.success).toBe(false);
  });

  it('should fail with invalid intent enum', () => {
    const result = validateFanResponse({ ...validFanResponse, intent: 'invalid-intent' });
    expect(result.success).toBe(false);
  });

  it('should fail with invalid confidence enum', () => {
    const result = validateFanResponse({ ...validFanResponse, confidence: 'very-high' });
    expect(result.success).toBe(false);
  });

  it('should parse response from JSON string with markdown fences', () => {
    const wrapped = '```json\n' + JSON.stringify(validFanResponse) + '\n```';
    const result = validateFanResponse(wrapped);
    expect(result.success).toBe(true);
  });

  it('should fail with invalid JSON', () => {
    const result = validateFanResponse('not-json{{{');
    expect(result.success).toBe(false);
  });
});

describe('validateOpsResponse', () => {
  it('should pass valid ops response', () => {
    const result = validateOpsResponse(JSON.stringify(validOpsResponse));
    expect(result.success).toBe(true);
    expect(result.data.humanApprovalRequired).toBe(true);
  });

  it('should enforce humanApprovalRequired=true even if AI returns false', () => {
    const withFalse = { ...validOpsResponse, humanApprovalRequired: false };
    const result = validateOpsResponse(withFalse);
    // Server enforces true before schema validation
    expect(result.success).toBe(true);
    expect(result.data.humanApprovalRequired).toBe(true);
  });

  it('should fail with missing executiveSummary', () => {
    const without = { ...validOpsResponse };
    delete without.executiveSummary;
    const result = validateOpsResponse(without);
    expect(result.success).toBe(false);
  });

  it('should fail with invalid overallRisk', () => {
    const result = validateOpsResponse({ ...validOpsResponse, overallRisk: 'extreme' });
    expect(result.success).toBe(false);
  });
});

describe('validateAnnouncementResponse', () => {
  it('should pass valid announcement', () => {
    const result = validateAnnouncementResponse(validAnnouncement);
    expect(result.success).toBe(true);
    expect(result.data.humanApprovalRequired).toBe(true);
  });

  it('should enforce humanApprovalRequired=true', () => {
    const result = validateAnnouncementResponse({ ...validAnnouncement, humanApprovalRequired: false });
    expect(result.success).toBe(true);
    expect(result.data.humanApprovalRequired).toBe(true);
  });

  it('should fail with empty announcement', () => {
    const result = validateAnnouncementResponse({ ...validAnnouncement, announcement: '' });
    expect(result.success).toBe(false);
  });
});
