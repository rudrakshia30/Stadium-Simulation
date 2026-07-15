/**
 * @module validators/opsRequestSchema
 * @description Zod validation schemas for operations Command Centre API requests in CrowdSphere AI.
 *   Enforces structure, types, string bounds, and enum allowlists for:
 *   - `loginSchema` — Ops login access code.
 *   - `scenarioSchema` — Active scenario switching.
 *   - `briefSchema` — AI brief generation.
 *   - `announcementSchema` — AI PA announcement drafting requests.
 *
 * @pr-changes
 *   - Configured strict validation allowlists for scenario IDs, audiences, tones, and languages.
 *   - Bound message and text inputs to safe limits (e.g. max 500 chars for recommendationText).
 *   - Strict mode `.strict()` enforced on all schemas to reject unrecognized fields.
 *
 * @validation-review
 *   - `SCENARIO_IDS` must stay aligned with the JSON files inside `src/data/scenarios/`.
 *     Any new scenario file must be added to this allowlist or the route will reject it.
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

/**
 * Validator schema for operations staff login.
 * @type {z.ZodType<Object>}
 */
export const loginSchema = z
  .object({
    // #What — Access code string; length capped to prevent Denial-of-Service via huge payloads.
    accessCode: z.string().min(1).max(200),
  })
  .strict();

/**
 * Validator schema for active scenario selection.
 * @type {z.ZodType<Object>}
 */
export const scenarioSchema = z
  .object({
    scenarioId: z.enum(SCENARIO_IDS),
  })
  .strict();

/**
 * Validator schema for brief generation requests.
 * @type {z.ZodType<Object>}
 */
export const briefSchema = z
  .object({
    scenarioId: z.enum(SCENARIO_IDS).optional(),
  })
  .strict();

/**
 * Validator schema for creating an AI-assisted PA announcement.
 * @type {z.ZodType<Object>}
 */
export const announcementSchema = z
  .object({
    audience: z.enum(ALLOWED_AUDIENCES),
    language: z.enum(ALLOWED_LANGUAGES).default('en'),
    tone: z.enum(ALLOWED_TONES).default('informational'),
    // #Business-Intent — Capping max length prevents the AI model from generating
    //   excessively long announcements that won't fit on digital screens/PA scripts.
    maxLength: z.number().int().min(50).max(500).default(200),
    incidentId: z.string().max(100).optional(),
    recommendationText: z.string().max(500).optional(),
  })
  .strict();
