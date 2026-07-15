/**
 * @module validators/fanRequestSchema
 * @description Zod validation schemas for fan API requests in CrowdSphere AI.
 *   Enforces structure, field types, string boundaries, and array limits for:
 *   - `fanChatSchema` — Incoming fan assistant chat requests.
 *   - `routeRequestSchema` — Direct route calculation requests.
 *
 *   These schemas are the first line of defense at the route handler level,
 *   rejecting malformed requests before any AI context processing or Dijkstra
 *   calculations begin.
 *
 * @pr-changes
 *   - Extracted Zod schemas for all fan-facing API endpoints.
 *   - Set strict maximum lengths on message, content, location strings, and
 *     array size parameters to mitigate Denial-of-Service vectors.
 *   - Strict mode `.strict()` enforced on all schemas to reject unrecognized fields.
 *
 * @validation-review
 *   - `ALLOWED_LANGUAGES` are matched against a fixed set; adding support for new
 *     languages requires updating this file first.
 *   - Route preferences default to `false` for each flag, ensuring consistent
 *     fallback behavior.
 */

import { z } from 'zod';

const ALLOWED_LANGUAGES = ['en', 'hi', 'es', 'fr', 'ar'];

/**
 * Validator schema for fan chat requests.
 * @type {z.ZodType<Object>}
 */
export const fanChatSchema = z
  .object({
    // #What — Fan's chat message; capped at 2000 characters to prevent runaway token usage.
    message: z.string().min(1).max(2000),
    language: z.enum(ALLOWED_LANGUAGES).default('en'),
    // #What — Back-and-forth history; limited to 20 messages to control context size.
    conversationHistory: z
      .array(
        z.object({
          role: z.enum(['user', 'model']),
          content: z.string().max(2000),
        }),
      )
      .max(20)
      .default([]),
    // #What — Fan's accessibility preferences.
    preferences: z
      .object({
        wheelchair: z.boolean().default(false),
        stepFree: z.boolean().default(false),
        avoidStairs: z.boolean().default(false),
        avoidCrowds: z.boolean().default(false),
        avoidLongWalking: z.boolean().default(false),
        elderly: z.boolean().default(false),
        children: z.boolean().default(false),
        sensoryFriendly: z.boolean().default(false),
      })
      .default({}),
    fromNode: z.string().max(100).optional(),
    toNode: z.string().max(100).optional(),
  })
  .strict();

/**
 * Validator schema for direct route calculation requests (URL query parameters).
 * @type {z.ZodType<Object>}
 */
export const routeRequestSchema = z
  .object({
    from: z.string().min(1).max(100),
    to: z.string().min(1).max(100),
    preferences: z
      .object({
        wheelchair: z.boolean().default(false),
        stepFree: z.boolean().default(false),
        avoidStairs: z.boolean().default(false),
        avoidCrowds: z.boolean().default(false),
        avoidLongWalking: z.boolean().default(false),
      })
      .default({}),
  })
  .strict();
