/**
 * Centralized configuration for CrowdSphere AI server.
 * All environment variables are read here. No other file reads process.env directly.
 *
 * @module config
 */

const DEV_JWT_SECRET = 'crowdsphere-dev-jwt-secret-minimum-32-chars-do-not-use-in-production';
const DEV_OPS_CODE = 'crowdsphere-demo-2026';

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required in production');
  if (!process.env.OPS_ACCESS_CODE) throw new Error('OPS_ACCESS_CODE is required in production');
}

export const config = {
  /** Server port */
  port: parseInt(process.env.PORT || '8080', 10),

  /** Node environment */
  nodeEnv: process.env.NODE_ENV || 'development',

  /** JWT signing secret — must be at least 32 chars in production */
  jwtSecret: process.env.JWT_SECRET || DEV_JWT_SECRET,

  /** Operations command centre demo access code */
  opsAccessCode: process.env.OPS_ACCESS_CODE || DEV_OPS_CODE,

  /** Gemini API key — optional; app works in demo mode without it */
  geminiApiKey: process.env.GEMINI_API_KEY || '',

  /** Gemini model identifier */
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',

  /** Allowed CORS origin for the browser client */
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',

  /** JWT token expiry */
  jwtExpiresIn: '15m',

  /** Maximum user message length in characters */
  maxMessageLength: 2000,

  /** Maximum conversation history messages */
  maxConversationLength: 20,

  /** Maximum Gemini tool-calling rounds per request */
  maxToolRounds: 3,

  /** In-memory route cache: maximum number of entries */
  cacheMaxSize: 100,

  /** In-memory route cache: time-to-live in milliseconds (30 seconds) */
  cacheTtlMs: 30_000,

  /** General API rate limit */
  rateLimit: {
    windowMs: 15 * 60 * 1000,
    max: 100,
  },

  /** Login endpoint rate limit */
  loginRateLimit: {
    windowMs: 15 * 60 * 1000,
    max: 10,
  },

  /** Whether the app is running in production */
  isProduction,
};
