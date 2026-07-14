import { Router } from 'express';
import { getDeparturesForQuery } from '../services/departureService.js';

const router = Router();
const WINDOW_MINUTES = 15;

router.get('/', async (req, res) => {
  const q = (req.query.q ?? '').trim();

  if (q.length < 3) {
    return res.status(400).json({
      error: 'query_too_short',
      message: 'Query must be at least 3 characters.',
      minLength: 3,
    });
  }

  try {
    const results = await getDeparturesForQuery(q, WINDOW_MINUTES);

    const formattedStations = results.map((s) => ({
      station: s.station,
      departures: s.departures.map((d) => ({
        trainNumber: d.trainNumber,
        destination: d.destination,
        scheduledTime: d.scheduledTime.toISOString(),
        delayMinutes: d.delayMinutes,
        cancelled: d.isCancelled,
        platform: d.platform && d.platform !== '?' ? String(d.platform) : undefined,
      })),
      error: s.error || undefined,
    }));

    return res.json({
      query: q,
      now: new Date().toISOString(),
      windowMinutes: WINDOW_MINUTES,
      stationCount: formattedStations.length,
      stations: formattedStations,
    });
  } catch (err) {
    return res.status(502).json({
      error: 'upstream_failed',
      message: 'Could not reach the iRail station index. Please try again.',
      detail: err.message,
    });
  }
});

export default router;

