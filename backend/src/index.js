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

// Graceful shutdown — ensures in-flight requests complete before the process exits
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Closing HTTP server gracefully...');
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
});

export default server;
