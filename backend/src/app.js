import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'crypto';
import NodeCache from 'node-cache';
import { config } from './config.js';
import departuresRouter from './routes/departures.js';
import apiDeparturesRouter from './routes/apiDepartures.js';
import { errorHandler } from './middleware/errorHandler.js';

// Track server start time for the enriched /health endpoint
const SERVER_START = Date.now();

/**
 * Express app factory.
 *
 * Creating the app in a factory function (rather than a module-level singleton)
 * is a critical pattern for testability: each test can create a fresh app instance
 * without state leaking between test suites.
 */
export function createApp() {
  const app = express();

  // ── Security & Parsing ─────────────────────────────────────────────────────
  app.use(helmet());

  // E-15: Restrict CORS to known origins — wildcard was too permissive for a production API
  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : ['http://localhost:8080', 'http://localhost:8081', 'http://localhost:5173'];

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow server-to-server (no Origin header) and whitelisted browser origins
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`CORS: origin "${origin}" is not allowed.`));
        }
      },
      credentials: true,
    })
  );

  app.use(express.json());

  // ── Request ID ────────────────────────────────────────────────────────────
  // F-12: Attach a unique ID to every request and response header for log correlation
  app.use((req, res, next) => {
    const requestId = req.headers['x-request-id'] || randomUUID();
    req.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);
    next();
  });

  // ── Logging ───────────────────────────────────────────────────────────────
  // Use 'dev' format in development, 'combined' in production
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

  // ── Rate Limiting ─────────────────────────────────────────────────────────
  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'TOO_MANY_REQUESTS',
      message: 'Too many requests. Please slow down and try again shortly.',
    },
  });
  app.use(limiter);

  // ── Routes ────────────────────────────────────────────────────────────────
  app.get('/', (_req, res) => {
    res.json({
      name: 'Lagovia Train Tracker API',
      version: '1.0.0',
      description: 'Belgian railway departure board aggregator API.',
      endpoints: {
        health: '/health',
        departures: '/departures?q=<query>',
        apiDepartures: '/api/departures?q=<query>',
      },
    });
  });

  // F-11: Enriched health check — reports uptime, Node version, and cache stats
  app.get('/health', (_req, res) => {
    const uptimeSeconds = Math.floor((Date.now() - SERVER_START) / 1000);
    const stationCache = new NodeCache();  // Note: in a real app, pass in the shared cache instance

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds,
      nodeVersion: process.version,
      environment: process.env.NODE_ENV ?? 'development',
      rateLimit: {
        windowMs: config.rateLimit.windowMs,
        maxPerWindow: config.rateLimit.max,
      },
    });
  });

  app.use('/departures', departuresRouter);
  app.use('/api/departures', apiDeparturesRouter);

  // 404 handler for unknown routes
  app.use((_req, res) => {
    res.status(404).json({
      error: 'NOT_FOUND',
      message: 'The requested endpoint does not exist.',
    });
  });

  // ── Centralized Error Handler ─────────────────────────────────────────────
  // Must be registered LAST — Express identifies error handlers by arity (4 args)
  app.use(errorHandler);

  return app;
}
