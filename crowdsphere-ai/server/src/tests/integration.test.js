/**
 * Integration tests for the CrowdSphere AI API.
 * Uses Supertest against the real Express app.
 * Gemini is always mocked — never calls the real API.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { setGeminiClient as setFanClient } from '../controllers/fanController.js';
import { setGeminiClient as setOpsClient } from '../controllers/opsController.js';
import { resetState } from '../data/operationsState.js';
import { FAN_FIXTURE, OPS_BRIEF_FIXTURE, ANNOUNCEMENT_FIXTURE } from '../ai/mockFixtures.js';

// Mock Gemini client — never calls real API
const mockGeminiClient = {
  isAvailable: () => false,
  generateContent: vi.fn(),
  generateWithRetry: vi.fn(),
};

beforeAll(() => {
  setFanClient(mockGeminiClient);
  setOpsClient(mockGeminiClient);
  resetState();
});

afterAll(() => {
  resetState();
});

// ─── Health ───────────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  it('should return 200 with status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data).not.toHaveProperty('geminiApiKey');
  });
});

// ─── Venue ────────────────────────────────────────────────────────────────

describe('GET /api/venue', () => {
  it('should return venue data', async () => {
    const res = await request(app).get('/api/venue');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Unity Arena');
    expect(res.body.data.gates).toBeDefined();
    expect(res.body.data.facilities).toBeDefined();
  });
});

describe('GET /api/venue/route', () => {
  it('should calculate a valid route', async () => {
    const res = await request(app)
      .get('/api/venue/route')
      .query({ from: 'gate-a', to: 'zone-north-concourse' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.verified).toBe(true);
    expect(res.body.data.nodes).toContain('gate-a');
  });

  it('should return 400 for invalid node IDs', async () => {
    const res = await request(app)
      .get('/api/venue/route')
      .query({ from: 'invalid-node', to: 'zone-north-concourse' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.success).toBe(false);
  });

  it('should return 400 for missing from/to', async () => {
    const res = await request(app).get('/api/venue/route');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ─── Fan Chat ─────────────────────────────────────────────────────────────

describe('POST /api/fan/chat', () => {
  it('should return demo fixture when Gemini is unavailable', async () => {
    const res = await request(app)
      .post('/api/fan/chat')
      .send({ message: 'How do I get to Section 214?', language: 'en' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.answer).toBeTruthy();
  });

  it('should reject message exceeding max length', async () => {
    const res = await request(app)
      .post('/api/fan/chat')
      .send({ message: 'A'.repeat(2001), language: 'en' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should reject invalid language', async () => {
    const res = await request(app)
      .post('/api/fan/chat')
      .send({ message: 'Hello', language: 'xx' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should reject unknown extra fields (strict mode)', async () => {
    const res = await request(app)
      .post('/api/fan/chat')
      .send({ message: 'Hello', language: 'en', unknownField: 'bad' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should reject payload over 10kb', async () => {
    const res = await request(app)
      .post('/api/fan/chat')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ message: 'A'.repeat(11000), language: 'en' }));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ─── Ops Login ────────────────────────────────────────────────────────────

describe('POST /api/ops/login', () => {
  it('should reject invalid access code', async () => {
    const res = await request(app)
      .post('/api/ops/login')
      .send({ accessCode: 'wrong-code' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should succeed with correct access code (dev default)', async () => {
    const res = await request(app)
      .post('/api/ops/login')
      .send({ accessCode: 'crowdsphere-demo-2026' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Cookie should be set
    const cookie = res.headers['set-cookie'];
    expect(cookie).toBeDefined();
    expect(cookie[0]).toContain('ops_token');
    expect(cookie[0]).toContain('HttpOnly');
  });

  it('should reject empty access code', async () => {
    const res = await request(app)
      .post('/api/ops/login')
      .send({ accessCode: '' });
    expect(res.status).toBe(400);
  });
});

// ─── Protected routes ─────────────────────────────────────────────────────

describe('Protected ops routes', () => {
  let authCookie;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/ops/login')
      .send({ accessCode: 'crowdsphere-demo-2026' });
    authCookie = res.headers['set-cookie'];
  });

  it('should reject GET /api/ops/snapshot without token', async () => {
    const res = await request(app).get('/api/ops/snapshot');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should allow GET /api/ops/snapshot with valid token', async () => {
    const res = await request(app)
      .get('/api/ops/snapshot')
      .set('Cookie', authCookie);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.metrics).toBeDefined();
  });

  it('should switch scenario', async () => {
    const res = await request(app)
      .post('/api/ops/scenario')
      .set('Cookie', authCookie)
      .send({ scenarioId: 'gate-d-surge' });
    expect(res.status).toBe(200);
    expect(res.body.data.scenarioId).toBe('gate-d-surge');
  });

  it('should reject invalid scenario ID', async () => {
    const res = await request(app)
      .post('/api/ops/scenario')
      .set('Cookie', authCookie)
      .send({ scenarioId: 'invalid-scenario' });
    expect(res.status).toBe(400);
  });

  it('should generate operations brief (fixture mode)', async () => {
    resetState();
    const res = await request(app)
      .post('/api/ops/brief')
      .set('Cookie', authCookie)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.humanApprovalRequired).toBe(true);
  });

  it('should generate announcement (fixture mode)', async () => {
    const res = await request(app)
      .post('/api/ops/announcement')
      .set('Cookie', authCookie)
      .send({ audience: 'fans', language: 'en', tone: 'informational' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.humanApprovalRequired).toBe(true);
  });

  it('should logout successfully', async () => {
    const res = await request(app)
      .post('/api/ops/logout')
      .set('Cookie', authCookie);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ─── 404 ──────────────────────────────────────────────────────────────────

describe('404 handler', () => {
  it('should return 404 for unknown routes', async () => {
    const res = await request(app).get('/api/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
