// GET /api/departures?q=<substring>
//
// Returns upcoming departures (next 15 min) from every station whose name
// matches the query by substring, with fuzzy fallback for typos.
//
// Response shape (200):
//   {
//     query, now, windowMinutes,
//     stations: [{ station: { id, name, matchType }, departures: [...], error? }]
//   }
//
// Errors:
//   400  { error: "query_too_short", message }
//   502  { error: "upstream_failed", message }   (station index unreachable)

import { createFileRoute } from '@tanstack/react-router';
import {
  getAllStations,
  getLiveboard,
  matchStations,
  normalizeDepartures,
  type StationDepartures,
} from '@/lib/irail';

const WINDOW_MINUTES = 15;
const MAX_STATIONS_PER_QUERY = 8; // cap upstream fanout

export const Route = createFileRoute('/api/departures')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const q = (url.searchParams.get('q') ?? '').trim();

        if (q.length < 3) {
          return Response.json(
            {
              error: 'query_too_short',
              message: 'Query must be at least 3 characters.',
              minLength: 3,
            },
            { status: 400 }
          );
        }

        let stations;
        try {
          stations = await getAllStations();
        } catch (err) {
          return Response.json(
            {
              error: 'upstream_failed',
              message: 'Could not reach the iRail station index. Please try again.',
              detail: err instanceof Error ? err.message : String(err),
            },
            { status: 502 }
          );
        }

        const matches = matchStations(stations, q, MAX_STATIONS_PER_QUERY);
        const now = Date.now();
        const windowMs = WINDOW_MINUTES * 60_000;

        const results = await Promise.all(
          matches.map(async (m): Promise<StationDepartures> => {
            try {
              const raw = await getLiveboard(m.id);
              return {
                station: m,
                departures: normalizeDepartures(raw, now, windowMs),
              };
            } catch (err) {
              // One flaky station shouldn't kill the whole response.
              return {
                station: m,
                departures: [],
                error:
                  err instanceof Error
                    ? err.message
                    : 'Failed to load departures for this station.',
              };
            }
          })
        );

        return Response.json(
          {
            query: q,
            now: new Date(now).toISOString(),
            windowMinutes: WINDOW_MINUTES,
            stationCount: results.length,
            stations: results,
          },
          {
            headers: {
              'Cache-Control': 'no-store',
            },
          }
        );
      },
    },
  },
});
