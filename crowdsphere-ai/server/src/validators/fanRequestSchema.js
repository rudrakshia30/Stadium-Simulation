/**
 * Zod validation schemas for fan API requests.
 *
 * @module validators/fanRequestSchema
 */

import { z } from 'zod';

const ALLOWED_LANGUAGES = ['en', 'hi', 'es', 'fr', 'ar'];

export const fanChatSchema = z
  .object({
    message: z.string().min(1).max(2000),
    language: z.enum(ALLOWED_LANGUAGES).default('en'),
    conversationHistory: z
      .array(
        z.object({
          role: z.enum(['user', 'model']),
          content: z.string().max(2000),
        }),
      )
      .max(20)
      .default([]),
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
