import { Router } from 'express';
import { z } from 'zod';
import { getDeparturesForQuery } from '../services/departureService.js';
import { createApiError } from '../middleware/errorHandler.js';
import { formatTime } from '../utils/timeUtils.js';

const router = Router();

/**
 * Query parameter validation schema.
 *
 * The challenge requires an explicit error when the query is < 3 characters.
 * We use Zod for declarative, self-documenting validation.
 */
const departuresQuerySchema = z.object({
  q: z
    .string({
      required_error: 'Query parameter "q" is required.',
      invalid_type_error: 'Query parameter "q" must be a string.',
    })
    .min(3, {
      message: 'Query must be at least 3 characters long.',
    }),
});

/**
 * GET /departures?q=<query>
 *
 * Returns upcoming departures (within 15 minutes) for all stations
 * whose name contains the search query as a case-insensitive substring.
 *
 * Error cases:
 *  - 400 QUERY_TOO_SHORT  : query is fewer than 3 characters
 *  - 400 MISSING_QUERY    : "q" parameter absent entirely
 *  - 503 IRAIL_UNAVAILABLE: upstream iRail API is unreachable
 */
router.get('/', async (req, res, next) => {
  // Validate query parameters
  const validation = departuresQuerySchema.safeParse(req.query);

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
    const { stations: results, truncated } = await getDeparturesForQuery(q);

    const formattedStations = results.map((s) => ({
      stationName: s.station.name,
      stationId: s.station.id,
      matchType: s.station.matchType,
      departures: s.departures.map((d) => ({
        id: d.id,
        trainNumber: d.trainNumber,
        destination: d.destination,
        scheduledDepartureTime: formatTime(Math.floor(d.scheduledTime.getTime() / 1000)),
        delayMinutes: d.delayMinutes,
        platform: d.platform,
        isCancelled: d.isCancelled,
        occupancy: d.occupancy,
      })),
    }));

    return res.json({
      query: q,
      fetchedAt: new Date().toISOString(),
      stationCount: formattedStations.length,
      truncated,
      stations: formattedStations,
    });
  } catch (err) {
    console.error('[/departures] Unhandled error:', err.message);
    if (err.code === 'IRAIL_RATE_LIMITED') {
      return next(createApiError(429, 'IRAIL_RATE_LIMITED', 'iRail is rate-limiting our requests. Please try again shortly.'));
    }
    if (err.code === 'IRAIL_TIMEOUT') {
      return next(createApiError(503, 'IRAIL_TIMEOUT', 'The iRail API did not respond in time. Please try again.'));
    }
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

