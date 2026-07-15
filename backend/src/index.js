import { createApp } from './app.js';
import { config } from './config.js';

/**
 * HTTP server entry point.
 *
 * This file is intentionally minimal — it only creates the Express app
 * and starts the HTTP server. All application logic lives in app.js
 * and the service/route modules.
 */

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`✅ Lagovia Train Tracker API running on http://localhost:${config.port}`);
  console.log(`   Health check: http://localhost:${config.port}/health`);
  console.log(`   Departures:   http://localhost:${config.port}/departures?q=Bru`);
});

/**
 * Graceful shutdown helper.
 * Closes the HTTP server and exits cleanly so in-flight requests complete.
 * @param {string} signal - The OS signal that triggered the shutdown
 */
function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Closing HTTP server gracefully...`);
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });

  // Force-kill if shutdown takes longer than 10 seconds
  setTimeout(() => {
    console.error('Shutdown timed out — forcing exit.');
    process.exit(1);
  }, 10_000);
}

// E-13: Handle SIGINT (Ctrl+C in dev) in addition to SIGTERM (Docker stop)
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

// E-14: Global safety nets for unexpected errors — log and keep the process alive
// (Express error middleware handles request-scoped errors; these catch everything else)
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled promise rejection at:', promise, 'reason:', reason);
  // Do NOT exit here — operational errors are handled per-request via errorHandler.js
  // Only programmer bugs (forgotten try/catch) land here; log them loudly but stay up.
});

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);
  // An uncaught synchronous exception means the process state is likely corrupt.
  // Graceful shutdown is the safest response here.
  gracefulShutdown('uncaughtException');
});

export default server;
