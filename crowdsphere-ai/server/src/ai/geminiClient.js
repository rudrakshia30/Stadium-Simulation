/**
 * Gemini client factory.
 * Wraps @google/genai with availability checking, error handling, and retry.
 * The API key never leaves the server.
 *
 * @module ai/geminiClient
 */

import { GoogleGenAI } from '@google/genai';
import { AIServiceError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Create a Gemini client.
 *
 * @param {string} apiKey - Gemini API key (empty string for demo mode)
 * @param {string} model - Model identifier
 * @returns {Object} Client with isAvailable(), generateContent(), generateWithRetry()
 */
export function createGeminiClient(apiKey, model) {
  const available = typeof apiKey === 'string' && apiKey.trim().length > 0;
  let ai = null;

  if (available) {
    ai = new GoogleGenAI({ apiKey: apiKey.trim() });
  }

  /**
   * Whether Gemini is configured and available.
   * @returns {boolean}
   */
  function isAvailable() {
    return available;
  }

  /**
   * Call Gemini generateContent.
   *
   * @param {Object} params
   * @param {string} params.systemInstruction
   * @param {Array<Object>} params.contents
   * @param {Array<Object>} [params.tools]
   * @param {Object} [params.generationConfig]
   * @param {AbortSignal} [params.signal]
   * @returns {Promise<Object>} Gemini response
   */
  async function generateContent({ systemInstruction, contents, tools, generationConfig, signal }) {
    if (!available || !ai) {
      throw new AIServiceError('Gemini is not configured. Add GEMINI_API_KEY to enable live AI responses.');
    }

    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction,
          tools: tools ? [{ functionDeclarations: tools }] : undefined,
          generationConfig: {
            maxOutputTokens: 2048,
            ...generationConfig,
          },
        },
        ...(signal ? { signal } : {}),
      });
      return response;
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      logger.error('Gemini API error', { message: err.message, status: err.status });
      throw new AIServiceError(`AI service error: ${err.message || 'Unknown error'}`);
    }
  }

  /**
   * Call Gemini with one automatic retry on transient error.
   *
   * @param {Object} params - Same as generateContent
   * @returns {Promise<Object>}
   */
  async function generateWithRetry(params) {
    try {
      return await generateContent(params);
    } catch (err) {
      if (err instanceof AIServiceError && !err.message.includes('not configured')) {
        logger.warn('Gemini transient error — retrying once', { message: err.message });
        await new Promise((resolve) => setTimeout(resolve, 500));
        return await generateContent(params);
      }
      throw err;
    }
  }

  return { isAvailable, generateContent, generateWithRetry };
}
