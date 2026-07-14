/**
 * AI response validator.
 * Parses and validates Gemini output before it reaches the client.
 * Never throws — always returns { success, data } or { success: false, error }.
 *
 * @module ai/responseValidator
 */

import { fanResponseSchema, opsResponseSchema, announcementResponseSchema } from './responseSchemas.js';
import { logger } from '../utils/logger.js';

/**
 * Parse a string as JSON safely.
 * @param {string|Object} raw
 * @returns {{ ok: boolean, value?: Object, error?: string }}
 */
function parseJson(raw) {
  if (typeof raw === 'object' && raw !== null) return { ok: true, value: raw };

  // Extract JSON from markdown code fences if present
  const jsonMatch = String(raw).match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1] : String(raw);

  try {
    return { ok: true, value: JSON.parse(jsonStr.trim()) };
  } catch (err) {
    return { ok: false, error: `JSON parse failed: ${err.message}` };
  }
}

/**
 * Validate a fan assistant response.
 * @param {string|Object} raw
 * @returns {{ success: boolean, data?: Object, error?: string }}
 */
export function validateFanResponse(raw) {
  const parsed = parseJson(raw);
  if (!parsed.ok) {
    logger.warn('Fan response JSON parse failed', { error: parsed.error });
    return { success: false, error: parsed.error };
  }

  const result = fanResponseSchema.safeParse(parsed.value);
  if (!result.success) {
    logger.warn('Fan response schema validation failed', {
      issues: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    });
    return { success: false, error: result.error.message };
  }

  return { success: true, data: result.data };
}

/**
 * Validate an operations brief response.
 * Also enforces humanApprovalRequired=true regardless of AI output.
 * @param {string|Object} raw
 * @returns {{ success: boolean, data?: Object, error?: string }}
 */
export function validateOpsResponse(raw) {
  const parsed = parseJson(raw);
  if (!parsed.ok) {
    logger.warn('Ops response JSON parse failed', { error: parsed.error });
    return { success: false, error: parsed.error };
  }

  // Enforce humanApprovalRequired=true server-side regardless of AI
  const withEnforcement = {
    ...parsed.value,
    humanApprovalRequired: true,
    priorities: Array.isArray(parsed.value.priorities)
      ? parsed.value.priorities.map((p) => ({ ...p, humanApprovalRequired: true }))
      : [],
  };

  const result = opsResponseSchema.safeParse(withEnforcement);
  if (!result.success) {
    logger.warn('Ops response schema validation failed', {
      issues: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      rawText: typeof raw === 'string' ? raw.slice(0, 1000) : JSON.stringify(raw).slice(0, 1000)
    });
    return { success: false, error: result.error.message };
  }

  return { success: true, data: result.data };
}

/**
 * Validate an announcement response.
 * Also enforces humanApprovalRequired=true.
 * @param {string|Object} raw
 * @returns {{ success: boolean, data?: Object, error?: string }}
 */
export function validateAnnouncementResponse(raw) {
  const parsed = parseJson(raw);
  if (!parsed.ok) {
    logger.warn('Announcement response JSON parse failed', { error: parsed.error });
    return { success: false, error: parsed.error };
  }

  const withEnforcement = { ...parsed.value, humanApprovalRequired: true };

  const result = announcementResponseSchema.safeParse(withEnforcement);
  if (!result.success) {
    logger.warn('Announcement response schema validation failed', {
      issues: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    });
    return { success: false, error: result.error.message };
  }

  return { success: true, data: result.data };
}
