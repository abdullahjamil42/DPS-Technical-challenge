import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import departuresRouter from './routes/departures.js';
import { errorHandler } from './middleware/errorHandler.js';

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
  app.use(cors());
  app.use(express.json());

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
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/departures', departuresRouter);

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
