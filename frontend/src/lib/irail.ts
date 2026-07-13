// iRail API helpers. Shared by the server route.
// Docs: https://docs.irail.be/

import Fuse from 'fuse.js';

const IRAIL_BASE = 'https://api.irail.be/v1';
const USER_AGENT = 'LagoviaTrainTracker/1.0 (technical-challenge)';

export interface IRailStation {
  id: string;
  name: string;
  standardname?: string;
}

export interface StationMatch {
  id: string;
  name: string;
  matchType: 'substring' | 'fuzzy';
}

export interface DepartureDTO {
  trainNumber: string;
  destination: string;
  scheduledTime: string; // ISO
  delayMinutes: number;
  cancelled: boolean;
  platform?: string;
}

export interface StationDepartures {
  station: { id: string; name: string; matchType: 'substring' | 'fuzzy' };
  departures: DepartureDTO[];
  error?: string;
}

// Cache stations for the process lifetime — the list is ~600 rows and stable.
let stationsCache: { stations: IRailStation[]; fetchedAt: number } | null = null;
const STATIONS_TTL_MS = 24 * 60 * 60 * 1000;

async function fetchJson(url: string, signal?: AbortSignal): Promise<any> {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal,
  });
  if (!res.ok) {
    throw new Error(`iRail request failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function getAllStations(signal?: AbortSignal): Promise<IRailStation[]> {
  if (stationsCache && Date.now() - stationsCache.fetchedAt < STATIONS_TTL_MS) {
    return stationsCache.stations;
  }
  const data = await fetchJson(`${IRAIL_BASE}/stations/?format=json`, signal);
  const stations: IRailStation[] = (data.station ?? []).map((s: any) => ({
    id: s.id,
    name: s.name,
    standardname: s.standardname,
  }));
  stationsCache = { stations, fetchedAt: Date.now() };
  return stations;
}

/**
 * Match stations by substring first, and if we have too few hits, fall back to
 * fuzzy matching so typos like "Antverpen" still find "Antwerpen-Centraal".
 */
export function matchStations(stations: IRailStation[], query: string, limit = 12): StationMatch[] {
  const q = query.trim().toLowerCase();
  const substringHits: StationMatch[] = [];
  const seen = new Set<string>();

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
    .map<StationMatch>((s) => ({ id: s.id, name: s.name, matchType: 'fuzzy' }));

  return [...substringHits, ...fuzzyHits];
}

export async function getLiveboard(stationId: string, signal?: AbortSignal): Promise<any> {
  const url = `${IRAIL_BASE}/liveboard/?id=${encodeURIComponent(
    stationId
  )}&format=json&arrdep=departure&lang=en`;
  return fetchJson(url, signal);
}

/**
 * Normalize an iRail liveboard payload to our DTO, filtered to departures
 * scheduled within [now, now + windowMs).
 */
export function normalizeDepartures(raw: any, now: number, windowMs: number): DepartureDTO[] {
  const list: any[] = raw?.departures?.departure ?? [];
  const cutoff = now + windowMs;

  return list
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
    .map(({ scheduledMs: _s, ...rest }) => rest);
}
