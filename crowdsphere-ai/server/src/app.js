/**
 * Express application setup for CrowdSphere AI server.
 *
 * @module app
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import {
  applyHelmet,
  applyCors,
  generalRateLimit,
  requestIdMiddleware,
  requestTimeout,
} from './middleware/security.js';
import { errorHandler } from './middleware/errorHandler.js';
import healthRoutes from './routes/health.js';
import venueRoutes from './routes/venue.js';
import fanRoutes from './routes/fan.js';
import opsRoutes from './routes/ops.js';

const app = express();

// ─── Security middleware ───────────────────────────────────────────────────
app.use(applyHelmet());
app.use(applyCors());
app.use(requestIdMiddleware);
app.use(requestTimeout);

// ─── Body parsing ──────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(cookieParser());

// ─── General rate limiting ─────────────────────────────────────────────────
app.use('/api/', generalRateLimit());

// ─── Routes ───────────────────────────────────────────────────────────────
app.use('/api/health', healthRoutes);
app.use('/api/venue', venueRoutes);
app.use('/api/fan', fanRoutes);
app.use('/api/ops', opsRoutes);

// ─── 404 handler ──────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Endpoint not found' },
  });
});

// ─── Global error handler ─────────────────────────────────────────────────
app.use(errorHandler);

export default app;
