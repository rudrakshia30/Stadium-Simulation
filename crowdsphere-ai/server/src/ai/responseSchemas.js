/**
 * Zod schemas for validating Gemini AI responses.
 * All AI output is validated before being sent to the client.
 *
 * @module ai/responseSchemas
 */

import { z } from 'zod';

export const fanResponseSchema = z.object({
  answer: z.string().min(1).max(3000),
  language: z.string().min(2).max(10),
  intent: z.enum(['navigation', 'facility', 'transportation', 'accessibility', 'safety', 'general']),
  verifiedFacts: z.array(z.string()).default([]),
  routeSummary: z.string().default(''),
  routeId: z.string().nullable().default(null),
  distanceMeters: z.number().min(0).default(0),
  estimatedMinutes: z.number().min(0).default(0),
  crowdLevel: z.enum(['low', 'moderate', 'high', 'critical', 'unknown']).default('unknown'),
  accessibilityNotes: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  recommendedNextAction: z.string().default(''),
  requiresStaffAssistance: z.boolean().default(false),
  confidence: z.enum(['high', 'medium', 'low']).default('medium'),
  dataFreshness: z.string().default(''),
  snapshotVersion: z.string().default('unknown'),
});

export const opsResponseSchema = z.object({
  generatedAt: z.string(),
  overallRisk: z.enum(['low', 'moderate', 'high', 'critical']),
  executiveSummary: z.string().min(1).max(2000),
  priorities: z.array(
    z.object({
      rank: z.number().int().min(1),
      title: z.string().min(1),
      severity: z.enum(['low', 'moderate', 'high', 'critical']),
      affectedZones: z.array(z.string()),
      verifiedEvidence: z.array(z.string()),
      recommendedActions: z.array(z.string()),
      rationale: z.string(),
      responsibleRole: z.string(),
      targetResponseMinutes: z.number().int().min(0),
      humanApprovalRequired: z.literal(true),
    }),
  ),
  fanCommunication: z.object({
    language: z.string(),
    message: z.string(),
  }),
  volunteerInstructions: z.array(z.string()).default([]),
  uncertainties: z.array(z.string()).default([]),
  missingInformation: z.array(z.string()).default([]),
  confidence: z.enum(['high', 'medium', 'low']),
  humanApprovalRequired: z.literal(true),
});

export const announcementResponseSchema = z.object({
  announcement: z.string().min(1).max(1000),
  language: z.string(),
  audience: z.string(),
  tone: z.string(),
  characterCount: z.number().int().min(0),
  humanApprovalRequired: z.literal(true),
});
