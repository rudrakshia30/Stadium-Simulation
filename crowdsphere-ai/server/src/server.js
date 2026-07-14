/**
 * CrowdSphere AI server entry point.
 * Initialises Gemini client, injects dependencies, starts HTTP server.
 *
 * @module server
 */

import app from './app.js';
import { config } from './config/index.js';
import { createGeminiClient } from './ai/geminiClient.js';
import { setGeminiClient as setFanGeminiClient } from './controllers/fanController.js';
import { setGeminiClient as setOpsGeminiClient } from './controllers/opsController.js';
import { logger } from './utils/logger.js';

// Initialise Gemini client
const geminiClient = createGeminiClient(config.geminiApiKey, config.geminiModel);

// Inject into controllers
setFanGeminiClient(geminiClient);
setOpsGeminiClient(geminiClient);

if (geminiClient.isAvailable()) {
  logger.info('Gemini client initialised', { model: config.geminiModel });
} else {
  logger.warn('Gemini API key not configured — running in demo fixture mode');
}

// Start server
const server = app.listen(config.port, () => {
  logger.info('CrowdSphere AI server started', {
    port: config.port,
    environment: config.nodeEnv,
    geminiAvailable: geminiClient.isAvailable(),
  });
});

// Graceful shutdown
function shutdown(signal) {
  logger.info(`Received ${signal} — shutting down gracefully`);
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default server;
