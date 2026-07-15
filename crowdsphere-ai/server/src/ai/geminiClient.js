/**
 * @module ai/geminiClient
 * @description Factory module that creates a configured Gemini AI client instance.
 *   Wraps the @google/genai SDK with availability checking, structured error handling,
 *   and a one-shot retry mechanism for transient network/API failures.
 *   The API key is consumed server-side only and is never forwarded to the browser.
 *
 * @pr-changes Added one-shot retry logic in generateWithRetry to handle transient
 *   Gemini 503/429 errors without surfacing them to the caller. Ensured AbortError
 *   propagation is preserved so request cancellation works correctly end-to-end.
 *
 * @validation-review
 *   - API key presence is checked at client creation time; an empty/whitespace key
 *     puts the client in unavailable state rather than sending a malformed request.
 *   - AbortError is re-thrown immediately (not treated as a retryable failure).
 *   - All other Gemini errors are wrapped in AIServiceError to prevent raw SDK error
 *     details from leaking to upstream callers.
 *   - generateWithRetry will NOT retry "not configured" errors to avoid masking
 *     misconfiguration issues in staging environments.
 *
 * @scope-of-improvement
 *   - Implement exponential back-off with jitter instead of a fixed 500 ms delay.
 *   - Add configurable retry count (currently hard-coded to 1).
 *   - Expose model token-usage metrics for cost-monitoring dashboards.
 *   - Support streaming responses (generateContentStream) for low-latency UX.
 *   - Add circuit-breaker pattern to fast-fail when the Gemini API is repeatedly down.
 *
 * @business-intent
 *   Centralises all Gemini SDK interactions so that API key management, error
 *   normalisation, and retry behaviour are maintained in one place. This prevents
 *   direct SDK imports from proliferating across service files and ensures every
 *   call benefits from the same safety guardrails.
 */

import { GoogleGenAI } from '@google/genai';
import { AIServiceError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Create and return a Gemini AI client with availability checking, content
 * generation, and automatic single-retry capabilities.
 *
 * @description Initialises the GoogleGenAI SDK instance only when a valid API key
 *   is present. Returns a plain object with three methods so callers never need to
 *   interact directly with the SDK. If the API key is absent the client operates in
 *   "unavailable" mode and every generation call throws a descriptive AIServiceError.
 *
 * @param {string} apiKey  - Gemini API key sourced from the server environment.
 *                           Pass an empty string to enable demo/fixture mode.
 * @param {string} model   - Gemini model identifier (e.g. 'gemini-2.0-flash').
 *
 * @returns {{ isAvailable: function, generateContent: function, generateWithRetry: function }}
 *   A client object exposing three methods (see inner function JSDoc for details).
 *
 * @business-intent Only server code ever calls this factory, ensuring the API key
 *   never travels to the client tier.
 */
export function createGeminiClient(apiKey, model) {
  // #What — Treat blank/whitespace keys as "no key provided" to prevent silent misconfiguration.
  // #Risk-Area — If apiKey were passed through from an untrusted source the trim() guards against
  //              accidental whitespace-padded strings being treated as valid keys.
  const available = typeof apiKey === 'string' && apiKey.trim().length > 0;

  // #What — ai is null in demo mode; all generation calls gate on `available` before using it.
  let ai = null;

  if (available) {
    // #Business-Intent — Only instantiate the SDK when an actual key exists; this keeps
    //                    demo deployments lightweight and free of SDK initialisation overhead.
    ai = new GoogleGenAI({ apiKey: apiKey.trim() });
  }

  /**
   * Report whether Gemini is configured and ready to serve requests.
   *
   * @description Returns true only when a non-empty API key was provided at
   *   factory creation time. Callers use this to branch between live AI and
   *   demo-fixture modes without inspecting the key directly.
   *
   * @returns {boolean} true if a valid API key was provided; false for demo mode.
   *
   * @business-intent Allows upstream services (fan assistant, ops brief, etc.) to
   *   operate without crashing when deployed in environments where GEMINI_API_KEY
   *   has not yet been configured (e.g. local dev, CI preview environments).
   */
  function isAvailable() {
    // #What — Pure read of the closure-scoped `available` flag set at factory init.
    return available;
  }

  /**
   * Invoke the Gemini generateContent API with the supplied conversation and config.
   *
   * @description Sends a structured request to the Gemini SDK and returns the raw
   *   response object. Wraps all SDK errors in AIServiceError so callers receive a
   *   consistent error type. AbortErrors are re-thrown unchanged to preserve
   *   request cancellation semantics.
   *
   * @param {Object}          params
   * @param {string}          params.systemInstruction - Server-side system prompt (never sent to browser).
   * @param {Array<Object>}   params.contents          - Conversation history in Gemini content format.
   * @param {Array<Object>}   [params.tools]           - Tool/function declarations for function-calling.
   * @param {Object}          [params.generationConfig] - Model generation overrides (temperature, tokens, etc.).
   * @param {AbortSignal}     [params.signal]           - Optional AbortSignal to cancel the request.
   *
   * @returns {Promise<Object>} Raw Gemini API response object.
   *
   * @throws {AIServiceError} When Gemini is not configured or the API returns an error.
   * @throws {Error} Re-throws AbortError unchanged.
   *
   * @risk-area The systemInstruction contains confidential prompt engineering rules.
   *   Ensure this value originates only from the server-side systemInstructions module
   *   and is never populated from user-supplied input.
   */
  async function generateContent({ systemInstruction, contents, tools, generationConfig, signal }) {
    if (!available || !ai) {
      // #Business-Intent — Surface a clear, actionable message in logs/monitoring so operators
      //                    know exactly why AI features are disabled in this environment.
      throw new AIServiceError('Gemini is not configured. Add GEMINI_API_KEY to enable live AI responses.');
    }

    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction,
          // #What — Wrap tool declarations in the functionDeclarations envelope required by the SDK.
          //         undefined is passed (not an empty array) when no tools are needed so the SDK
          //         does not emit an unnecessary tools field in the request body.
          tools: tools ? [{ functionDeclarations: tools }] : undefined,
          generationConfig: {
            // #Business-Intent — 2048 tokens caps response size to prevent runaway generation
            //                    costs while still allowing detailed operational briefs.
            maxOutputTokens: 2048,
            // #What — Spread caller overrides last so they can increase the token budget if needed.
            ...generationConfig,
          },
        },
        // #What — Conditionally attach the AbortSignal only when provided; avoids spreading
        //         an undefined `signal` property which some SDK versions reject.
        ...(signal ? { signal } : {}),
      });
      return response;
    } catch (err) {
      // #What — AbortError must not be wrapped — it carries cancellation semantics
      //         that the caller (e.g. an Express request handler) relies on.
      if (err?.name === 'AbortError') throw err;

      // #Risk-Area — Log the raw error internally but expose only a sanitised message
      //              upstream to prevent SDK internals / stack traces from leaking.
      logger.error('Gemini API error', { message: err.message, status: err.status });
      throw new AIServiceError(`AI service error: ${err.message || 'Unknown error'}`);
    }
  }

  /**
   * Call generateContent with one automatic retry on transient errors.
   *
   * @description Attempts a Gemini API call and, if it fails with a non-config
   *   AIServiceError, waits 500 ms before trying exactly once more. If the second
   *   attempt also fails the error is propagated to the caller. Configuration errors
   *   (missing API key) are never retried.
   *
   * @param {Object} params - Identical parameter set as {@link generateContent}.
   *
   * @returns {Promise<Object>} Raw Gemini API response object.
   *
   * @throws {AIServiceError} On second failure or configuration error.
   * @throws {Error} Re-throws AbortError unchanged.
   *
   * @risk-area A naive retry can amplify costs on genuine quota-exhaustion errors.
   *   Future iterations should inspect the HTTP status code and skip retry on 400/401.
   *
   * @business-intent Improves reliability under intermittent network glitches without
   *   requiring callers to implement their own retry logic.
   */
  async function generateWithRetry(params) {
    try {
      return await generateContent(params);
    } catch (err) {
      // #What — Only retry transient AIServiceErrors; "not configured" errors indicate a
      //         deployment problem that won't resolve itself within 500 ms.
      if (err instanceof AIServiceError && !err.message.includes('not configured')) {
        logger.warn('Gemini transient error — retrying once', { message: err.message });

        // #Uncertain — A fixed 500 ms delay is a reasonable starting point but may be
        //              too short for rate-limit (429) back-off windows. Monitor in production.
        await new Promise((resolve) => setTimeout(resolve, 500));
        return await generateContent(params);
      }
      throw err;
    }
  }

  // #What — Return only the three public methods; the `ai` SDK instance and `available`
  //         flag remain private to this closure to prevent external mutation.
  return { isAvailable, generateContent, generateWithRetry };
}
