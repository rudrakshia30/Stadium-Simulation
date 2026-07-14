/**
 * Zod validation schemas for operations API requests.
 *
 * @module validators/opsRequestSchema
 */

import { z } from 'zod';

const SCENARIO_IDS = [
  'normal-entry', 'gate-d-surge', 'medical-incident-214', 'elevator-unavailable',
  'metro-disruption', 'post-match-exit', 'heavy-rain', 'lost-child',
  'volunteer-shortage', 'movement-conflict',
];

const ALLOWED_AUDIENCES = ['fans', 'volunteers', 'accessibility-staff', 'transport-coordinators', 'security'];
const ALLOWED_TONES = ['urgent', 'informational', 'reassuring', 'instructional'];
const ALLOWED_LANGUAGES = ['en', 'hi', 'es', 'fr', 'ar'];

export const loginSchema = z
  .object({
    accessCode: z.string().min(1).max(200),
  })
  .strict();

export const scenarioSchema = z
  .object({
    scenarioId: z.enum(SCENARIO_IDS),
  })
  .strict();

export const briefSchema = z
  .object({
    scenarioId: z.enum(SCENARIO_IDS).optional(),
  })
  .strict();

export const announcementSchema = z
  .object({
    audience: z.enum(ALLOWED_AUDIENCES),
    language: z.enum(ALLOWED_LANGUAGES).default('en'),
    tone: z.enum(ALLOWED_TONES).default('informational'),
    maxLength: z.number().int().min(50).max(500).default(200),
    incidentId: z.string().max(100).optional(),
    recommendationText: z.string().max(500).optional(),
  })
  .strict();
