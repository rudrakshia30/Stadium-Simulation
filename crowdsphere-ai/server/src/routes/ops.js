/**
 * Operations Command Centre routes.
 * Protected routes require valid JWT cookie.
 *
 * @module routes/ops
 */
import { Router } from 'express';
import { loginRateLimit } from '../middleware/security.js';
import { requireAuth } from '../middleware/auth.js';
import {
  login,
  logout,
  getSnapshot,
  setScenario,
  generateBrief,
  createAnnouncement,
} from '../controllers/opsController.js';

const router = Router();

// Public
router.post('/login', loginRateLimit(), login);
router.post('/logout', logout);

// Protected
router.get('/snapshot', requireAuth, getSnapshot);
router.post('/scenario', requireAuth, setScenario);
router.post('/brief', requireAuth, generateBrief);
router.post('/announcement', requireAuth, createAnnouncement);

export default router;
