/**
 * Application configuration.
 * All environment-dependent values live here — never scattered across files.
 */
export const config = {
  port: process.env.PORT || 3001,
  irail: {
    baseUrl: 'https://api.irail.be',
    /** User-Agent as requested by iRail best practices */
    userAgent: 'LagöviaTrainTracker/1.0.0 (github.com/abdullahjamil42/DPS-Technical-challenge)',
    /** Station list rarely changes; cache for 1 hour */
    stationCacheTtlSeconds: 3600,
    /** Liveboards change every few minutes; cache for 30 seconds */
    liveboardCacheTtlSeconds: 30,
    /** Departure window: only show trains departing within this many minutes */
    departureWindowMinutes: 15,
    /** HTTP timeout for iRail requests (ms) */
    requestTimeoutMs: 8000,
  },
  rateLimit: {
    windowMs: 60 * 1000, // 1 minute
    max: 60,             // 60 requests per minute per IP
  },
};
