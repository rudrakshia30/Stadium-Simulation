/**
 * @module server
 * @description CrowdSphere AI server entry point.
 *   Initialises the Google Gemini AI client, injects it into both the
 *   fanController and opsController via setter functions, then binds
 *   the Express app to the configured TCP port. Also registers OS-level
 *   signal handlers for graceful shutdown so in-flight HTTP connections
 *   are drained before the process exits.
 *
 * @pr-changes Added graceful shutdown logic (SIGTERM/SIGINT handlers) with a
 *   10-second forced-exit timeout; added Gemini client availability check that
 *   falls back to demo-fixture mode when the API key is absent.
 *
 * @validation-review
 *   - Gemini client availability is validated immediately after construction;
 *     missing API key downgrades to demo mode instead of crashing.
 *   - Forced-exit timeout (10 s) must exceed the longest expected in-flight
 *     request duration; review if p99 latency approaches that ceiling.
 *   - `process.exit(1)` inside the timeout callback may skip any registered
 *     `exit` listeners — ensure cleanup hooks are idempotent.
 *
 * @scope-of-improvement
 *   - Replace the raw `setTimeout` forced-exit with a `finally` block or
 *     an `AbortController`-based approach for cleaner resource release.
 *   - Externalise the 10-second shutdown timeout into `config` so it can
 *     be tuned per environment without a code change.
 *   - Add database / Redis connection teardown inside the `server.close`
 *     callback when persistence layers are introduced.
 *   - Consider emitting a structured "server_stop" metrics event on shutdown
 *     for SRE observability dashboards.
 *
 * @business-intent
 *   This is the single boot file for the CrowdSphere AI backend service.
 *   Graceful shutdown is critical for stadium-day operations: abruptly killing
 *   the process during peak crowd-query load would drop live fan requests and
 *   could cascade into safety-system alert delays. The demo-fixture fallback
 *   ensures the product can be demoed to venue stakeholders without a live
 *   Gemini quota.
 */

import app from './app.js';
import { config } from './config/index.js';
import { createGeminiClient } from './ai/geminiClient.js';
import { setGeminiClient as setFanGeminiClient } from './controllers/fanController.js';
import { setGeminiClient as setOpsGeminiClient } from './controllers/opsController.js';
import { logger } from './utils/logger.js';

// #What — Construct the Gemini AI client singleton using the API key and model
//         name sourced entirely from environment-controlled config (no hardcodes).
const geminiClient = createGeminiClient(config.geminiApiKey, config.geminiModel);

// #What — Inject the shared Gemini client into each domain controller so they
//         share a single connection pool / quota bucket.
// #Business-Intent — Centralised injection prevents multiple API clients from
//         being constructed, which would multiply quota consumption and make
//         rate-limit tracking ambiguous across fan vs. ops workloads.
setFanGeminiClient(geminiClient);
setOpsGeminiClient(geminiClient);

// #What — Log Gemini availability status at startup to make demo-mode vs.
//         live-AI mode immediately visible in log streams / dashboards.
if (geminiClient.isAvailable()) {
  logger.info('Gemini client initialised', { model: config.geminiModel });
} else {
  // #Uncertain — "demo fixture mode" semantics depend on controller implementation;
  //   confirm that all tool-calling paths safely degrade when this flag is false.
  logger.warn('Gemini API key not configured — running in demo fixture mode');
}

// #What — Bind the Express application to the configured port and log the
//         resulting server state (port, env, AI availability) for ops visibility.
const server = app.listen(config.port, () => {
  logger.info('CrowdSphere AI server started', {
    port: config.port,
    environment: config.nodeEnv,
    geminiAvailable: geminiClient.isAvailable(),
  });
});

/**
 * Perform a graceful HTTP server shutdown in response to an OS signal.
 *
 * @description
 *   Calls `server.close()` to stop accepting new connections while allowing
 *   existing connections to finish. If the server has not closed within
 *   10 seconds, a forced `process.exit(1)` is triggered to prevent zombie
 *   processes from accumulating in the container orchestration layer.
 *
 * @param {string} signal - The OS signal name (e.g. 'SIGTERM', 'SIGINT').
 * @returns {void}
 *
 * @risk-area
 *   The 10-second forced-exit timeout uses `process.exit(1)`, which bypasses
 *   `process.on('exit')` listeners. Any cleanup logic registered there will be
 *   skipped. Prefer explicit teardown inside this function or inside
 *   `server.close()`'s callback.
 *
 * @business-intent
 *   Kubernetes/Docker deployments send SIGTERM before forcibly killing a pod.
 *   Honouring this signal ensures fan-facing AI queries that are mid-flight are
 *   allowed to complete, preventing degraded UX during rolling deployments on
 *   match days.
 */
function shutdown(signal) {
  logger.info(`Received ${signal} — shutting down gracefully`);

  // #What — Stop accepting new HTTP connections; existing keep-alive sockets
  //         will still be served until they idle out or complete their request.
  server.close(() => {
    logger.info('Server closed');
    // #What — Exit with code 0 (success) after clean drain to signal the process
    //         manager that shutdown was intentional and orderly.
    process.exit(0);
  });

  // #Risk-Area — Hard kill after 10 s; any unresolved AI streaming calls will be
  //   terminated abruptly. Tune this value if AI response times are near the limit.
  // @human-approval-required — Verify this timeout is acceptable for the SLA
  //   before deploying to a production stadium environment.
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

// #What — Register signal handlers so both Kubernetes SIGTERM (graceful stop)
//         and developer Ctrl-C SIGINT (local dev) trigger the same clean exit.
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default server;
