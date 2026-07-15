import { Router } from 'express';
import { z } from 'zod';
import { getDeparturesForQuery } from '../services/departureService.js';
import { createApiError } from '../middleware/errorHandler.js';

const router = Router();
const WINDOW_MINUTES = 15;

/**
 * Query parameter validation schema (mirrors /departures for consistency).
 */
const querySchema = z.object({
  q: z
    .string({
      required_error: 'Query parameter "q" is required.',
      invalid_type_error: 'Query parameter "q" must be a string.',
    })
    .min(3, { message: 'Query must be at least 3 characters long.' }),
});

/**
 * GET /api/departures?q=<query>
 *
 * Machine-friendly version of the departures endpoint.
 * Returns raw ISO timestamps instead of formatted time strings.
 *
 * Error cases (consistent with /departures):
 *  - 400 QUERY_TOO_SHORT  : query is fewer than 3 characters
 *  - 400 MISSING_QUERY    : "q" parameter absent entirely
 *  - 429 IRAIL_RATE_LIMITED: iRail is rate-limiting our requests
 *  - 503 IRAIL_UNAVAILABLE: upstream iRail API is unreachable
 *
 * Note: `next` is included so unexpected errors reach the central errorHandler — E-11
 */
router.get('/', async (req, res, next) => {
  // Validate query parameters (E-10: use same Zod+createApiError pattern as /departures)
  const validation = querySchema.safeParse(req.query);

  if (!validation.success) {
    const firstIssue = validation.error.issues[0];
    const isTooShort = firstIssue.code === 'too_small';

    return next(
      createApiError(
        400,
        isTooShort ? 'QUERY_TOO_SHORT' : 'MISSING_QUERY',
        firstIssue.message,
        isTooShort ? { minLength: 3, received: req.query.q?.length ?? 0 } : {}
      )
    );
  }

  const { q } = validation.data;

  try {
    const { stations, truncated } = await getDeparturesForQuery(q, WINDOW_MINUTES);

    const formattedStations = stations.map((s) => ({
      station: s.station,
      departures: s.departures.map((d) => ({
        trainNumber: d.trainNumber,
        destination: d.destination,
        scheduledTime: d.scheduledTime.toISOString(),
        delayMinutes: d.delayMinutes,
        cancelled: d.isCancelled,
        platform: d.platform && d.platform !== '?' ? String(d.platform) : undefined,
        occupancy: d.occupancy !== 'unknown' ? d.occupancy : undefined,
      })),
      ...(s.error ? { error: s.error } : {}),
    }));

    return res.json({
      query: q,
      now: new Date().toISOString(),
      windowMinutes: WINDOW_MINUTES,
      stationCount: formattedStations.length,
      truncated,  // E-8: tells clients if more stations exist beyond the limit
      stations: formattedStations,
    });
  } catch (err) {
    // E-12: Use consistent 503 code matching /departures (was 502)
    if (err.code === 'IRAIL_RATE_LIMITED') {
      return next(
        createApiError(429, 'IRAIL_RATE_LIMITED', 'iRail is rate-limiting our requests. Please try again in a few seconds.')
      );
    }
    if (err.code === 'IRAIL_TIMEOUT') {
      return next(
        createApiError(503, 'IRAIL_TIMEOUT', 'The iRail API did not respond in time. Please try again.')
      );
    }
    console.error('[/api/departures] Unhandled error:', err.message);
    return next(
      createApiError(
        503,
        'IRAIL_UNAVAILABLE',
        'Could not retrieve departure data. The upstream iRail API may be temporarily unavailable.'
      )
    );
  }
});

export default router;
