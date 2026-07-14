/**
 * Announcement generation AI service.
 * Generates multilingual, audience-specific announcements from verified incident data.
 * humanApprovalRequired is always enforced server-side.
 *
 * @module ai/announcementService
 */

import { ANNOUNCEMENT_SYSTEM_INSTRUCTION } from './systemInstructions.js';
import { validateAnnouncementResponse } from './responseValidator.js';
import { ANNOUNCEMENT_FIXTURE } from './mockFixtures.js';
import { logger } from '../utils/logger.js';

const ALLOWED_AUDIENCES = ['fans', 'volunteers', 'accessibility-staff', 'transport-coordinators', 'security'];
const ALLOWED_TONES = ['urgent', 'informational', 'reassuring', 'instructional'];
const ALLOWED_LANGUAGES = ['en', 'hi', 'es', 'fr', 'ar'];

/**
 * Generate a multilingual announcement.
 *
 * @param {Object} params
 * @param {string} params.audience
 * @param {string} params.language
 * @param {string} params.tone
 * @param {number} params.maxLength
 * @param {string} [params.incidentId]
 * @param {string} [params.recommendationText]
 * @param {Object} geminiClient
 * @param {Object} operationsState
 * @returns {Promise<Object>} Validated announcement response
 */
export async function generateAnnouncement(params, geminiClient, operationsState) {
  const { audience, language, tone, maxLength, incidentId, recommendationText } = params;

  if (!geminiClient.isAvailable()) {
    logger.info('Announcement: demo fixture mode (no API key)');
    return { ...ANNOUNCEMENT_FIXTURE, audience, language, tone };
  }

  // Find referenced incident (if any)
  const incident = incidentId
    ? operationsState.crowd.incidents.find((i) => i.id === incidentId)
    : null;

  const context = [
    `Target audience: ${audience}`,
    `Language: ${language}`,
    `Tone: ${tone}`,
    `Maximum length: ${maxLength} characters`,
    incident
      ? `Incident: ${incident.type} (${incident.severity}) in ${incident.zone} — "${incident.description}"`
      : 'No specific incident selected.',
    recommendationText
      ? `Operational recommendation: ${recommendationText}`
      : '',
    '',
    'Unity Arena (fictional demonstration venue).',
    'All data is simulated.',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const response = await geminiClient.generateWithRetry({
      systemInstruction: ANNOUNCEMENT_SYSTEM_INSTRUCTION,
      contents: [
        {
          role: 'user',
          parts: [{ text: `Generate an announcement for the following context:\n\n${context}` }],
        },
      ],
    });

    const textPart = response?.candidates?.[0]?.content?.parts?.find((p) => p.text);
    const rawText = textPart?.text || '';

    const validation = validateAnnouncementResponse(rawText);
    if (validation.success) return validation.data;

    logger.warn('Announcement validation failed — returning fixture');
    return { ...ANNOUNCEMENT_FIXTURE, audience, language, tone };
  } catch (err) {
    logger.error('Announcement service error', { message: err.message });
    return { ...ANNOUNCEMENT_FIXTURE, audience, language, tone };
  }
}
