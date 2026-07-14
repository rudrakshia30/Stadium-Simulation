/**
 * API client for CrowdSphere AI.
 * All requests go through this module.
 * Uses AbortController to prevent duplicate in-flight requests.
 *
 * @module api/client
 */

const BASE_URL = 'https://stadium-simulation.onrender.com/api';
const DEFAULT_TIMEOUT_MS = 30000;

/** Active abort controllers per endpoint key */
const controllers = new Map();

/**
 * Abort any in-flight request for a given key.
 * @param {string} key
 */
export function abortRequest(key) {
  if (controllers.has(key)) {
    controllers.get(key).abort();
    controllers.delete(key);
  }
}

/**
 * Core fetch wrapper with timeout, deduplication, and error normalisation.
 *
 * @param {string} endpoint - API path (e.g. '/fan/chat')
 * @param {Object} [options]
 * @param {string} [options.method]
 * @param {unknown} [options.body]
 * @param {string} [options.dedupeKey] - Key for abort deduplication
 * @param {number} [options.timeoutMs]
 * @returns {Promise<unknown>} Parsed response data
 */
async function request(endpoint, options = {}) {
  const {
    method = 'GET',
    body,
    dedupeKey,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  const key = dedupeKey || `${method}:${endpoint}`;

  // Abort previous in-flight request for this key
  if (controllers.has(key)) {
    controllers.get(key).abort();
  }

  const controller = new AbortController();
  controllers.set(key, controller);

  const timeout = setTimeout(() => controller.abort('timeout'), timeoutMs);

  try {
    const token = localStorage.getItem('ops_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const fetchOptions = {
      method,
      headers,
      credentials: 'include', // Send HttpOnly cookies
      signal: controller.signal,
    };

    if (body !== undefined) {
      fetchOptions.body = JSON.stringify(body);
    }

    const res = await fetch(`${BASE_URL}${endpoint}`, fetchOptions);

    let data;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      const text = await res.text();
      throw new ApiError(`Non-JSON response: ${text.slice(0, 100)}`, res.status);
    }

    if (!res.ok) {
      const code = data?.error?.code || 'API_ERROR';
      const message = data?.error?.message || `Request failed with status ${res.status}`;
      throw new ApiError(message, res.status, code);
    }

    return data.data;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new ApiError('Request cancelled', 0, 'ABORTED');
    }
    if (err instanceof ApiError) throw err;
    throw new ApiError(err.message || 'Network error', 0, 'NETWORK_ERROR');
  } finally {
    clearTimeout(timeout);
    controllers.delete(key);
  }
}

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
    this.isApiError = true;
  }
}

// ─── Typed endpoint helpers ────────────────────────────────────────────────

export const api = {
  /** GET /api/health */
  health: () => request('/health'),

  /** GET /api/venue */
  venue: () => request('/venue'),

  /**
   * GET /api/venue/route
   * @param {{ from: string, to: string, preferences?: Object }} params
   */
  route: (params) => {
    const qs = new URLSearchParams({ from: params.from, to: params.to });
    if (params.preferences?.wheelchair) qs.set('preferences[wheelchair]', 'true');
    if (params.preferences?.stepFree) qs.set('preferences[stepFree]', 'true');
    if (params.preferences?.avoidStairs) qs.set('preferences[avoidStairs]', 'true');
    if (params.preferences?.avoidCrowds) qs.set('preferences[avoidCrowds]', 'true');
    return request(`/venue/route?${qs.toString()}`, { dedupeKey: 'GET:route' });
  },

  /**
   * POST /api/fan/chat
   * @param {Object} body
   */
  fanChat: (body) =>
    request('/fan/chat', { method: 'POST', body, dedupeKey: 'POST:fan/chat' }),

  opsLogin: async (body) => {
    const data = await request('/ops/login', { method: 'POST', body });
    if (data && data.token) {
      localStorage.setItem('ops_token', data.token);
    }
    return data;
  },

  /** POST /api/ops/logout */
  opsLogout: async () => {
    const data = await request('/ops/logout', { method: 'POST' });
    localStorage.removeItem('ops_token');
    return data;
  },

  /** GET /api/ops/snapshot */
  opsSnapshot: () => request('/ops/snapshot', { dedupeKey: 'GET:ops/snapshot' }),

  /**
   * POST /api/ops/scenario
   * @param {{ scenarioId: string }} body
   */
  opsSetScenario: (body) => request('/ops/scenario', { method: 'POST', body }),

  /**
   * POST /api/ops/brief
   * @param {Object} body
   */
  opsGenerateBrief: (body = {}) =>
    request('/ops/brief', { method: 'POST', body, dedupeKey: 'POST:ops/brief', timeoutMs: 60000 }),

  /**
   * POST /api/ops/announcement
   * @param {Object} body
   */
  opsGenerateAnnouncement: (body) =>
    request('/ops/announcement', { method: 'POST', body, dedupeKey: 'POST:ops/announcement', timeoutMs: 30000 }),
};
