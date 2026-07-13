import { Router } from 'express';
import Fuse from 'fuse.js';
import { getAllStations, getLiveboard } from '../services/irailService.js';

const router = Router();
const WINDOW_MINUTES = 15;
const MAX_STATIONS_PER_QUERY = 8;

export function matchStations(stations, query, limit = 12) {
  const q = query.trim().toLowerCase();
  const substringHits = [];
  const seen = new Set();

  for (const s of stations) {
    const hay = `${s.name} ${s.standardname ?? ''}`.toLowerCase();
    if (hay.includes(q)) {
      substringHits.push({ id: s.id, name: s.name, matchType: 'substring' });
      seen.add(s.id);
      if (substringHits.length >= limit) break;
    }
  }

  if (substringHits.length >= limit) return substringHits;

  const fuse = new Fuse(stations, {
    keys: ['name', 'standardname'],
    threshold: 0.4,
    ignoreLocation: true,
    minMatchCharLength: 3,
  });

  const fuzzyHits = fuse
    .search(query, { limit: limit * 2 })
    .map((r) => r.item)
    .filter((s) => !seen.has(s.id))
    .slice(0, limit - substringHits.length)
    .map((s) => ({ id: s.id, name: s.name, matchType: 'fuzzy' }));

  return [...substringHits, ...fuzzyHits];
}

export function normalizeDepartures(raw, now, windowMs) {
  const list = raw?.departures?.departure ?? [];
  const cutoff = now + windowMs;

  const arr = Array.isArray(list) ? list : [list];

  return arr
    .map((d) => {
      const scheduledMs = Number(d.time) * 1000;
      return {
        trainNumber: d.vehicleinfo?.shortname ?? d.vehicle ?? 'unknown',
        destination: d.station,
        scheduledTime: new Date(scheduledMs).toISOString(),
        scheduledMs,
        delayMinutes: Math.round(Number(d.delay ?? 0) / 60),
        cancelled: d.canceled === '1' || d.canceled === 1,
        platform: d.platform && d.platform !== '?' ? String(d.platform) : undefined,
      };
    })
    .filter((d) => d.scheduledMs >= now && d.scheduledMs < cutoff)
    .sort((a, b) => a.scheduledMs - b.scheduledMs)
    .map(({ scheduledMs, ...rest }) => rest);
}

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
    const stations = await getAllStations();
    const matches = matchStations(stations, q, MAX_STATIONS_PER_QUERY);
    const now = Date.now();
    const windowMs = WINDOW_MINUTES * 60 * 1000;

    const results = await Promise.all(
      matches.map(async (m) => {
        try {
          const raw = await getLiveboard(m.name);
          return {
            station: m,
            departures: normalizeDepartures(raw, now, windowMs),
          };
        } catch (err) {
          return {
            station: m,
            departures: [],
            error: err instanceof Error ? err.message : 'Failed to load departures for this station.',
          };
        }
      })
    );

    return res.json({
      query: q,
      now: new Date(now).toISOString(),
      windowMinutes: WINDOW_MINUTES,
      stationCount: results.length,
      stations: results,
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
