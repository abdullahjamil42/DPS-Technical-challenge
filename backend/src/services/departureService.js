import Fuse from 'fuse.js';
import { getAllStations, getLiveboard } from './irailService.js';
import { formatTime, delayToMinutes, isWithinDepartureWindow } from '../utils/timeUtils.js';
import { config } from '../config.js';

/**
 * Departure Service — pure business logic layer.
 *
 * Contains zero HTTP concerns. It receives raw iRail data
 * and applies the domain rules specified in the challenge brief:
 *
 *  1. Station matching: case-insensitive substring search with fuzzy fallback
 *  2. Time filtering: only departures within the next 15 minutes
 *  3. Data transformation: normalize iRail's schema to our API contract
 *  4. Grouping: results grouped by matched station
 */

/**
 * Finds all stations whose name (or standardname) contains the query
 * as a case-insensitive substring.
 *
 * We search both `name` and `standardname` fields to handle the bonus case:
 * searching "Antwerpen" should find "Antwerpen-Centraal".
 *
 * @param {Array<object>} stations - Full station list from iRail
 * @param {string} query - User search query
 * @returns {Array<object>} Matching station objects
 */
export function filterStationsByQuery(stations, query) {
  const lowerQuery = query.toLowerCase();
  return stations.filter((station) => {
    const nameMatch = station.name?.toLowerCase().includes(lowerQuery);
    const standardNameMatch = station.standardname?.toLowerCase().includes(lowerQuery);
    return nameMatch || standardNameMatch;
  });
}

/**
 * Advanced station matching logic: matches by substring first, then falls back
 * to fuzzy matching via Fuse.js for typos.
 *
 * @param {Array<object>} stations - Full station list from iRail
 * @param {string} query - User search query
 * @param {number} limit - Maximum number of matches
 * @returns {{ matches: Array<object>, truncated: boolean }}
 */
export function matchStations(stations, query, limit = 8) {
  const q = query.trim().toLowerCase();
  const substringHits = [];
  const seen = new Set();
  let totalSubstringCount = 0;

  for (const s of stations) {
    const hay = `${s.name} ${s.standardname ?? ''}`.toLowerCase();
    if (hay.includes(q)) {
      totalSubstringCount++;
      if (substringHits.length < limit) {
        substringHits.push({ id: s.id, name: s.name, matchType: 'substring' });
        seen.add(s.id);
      }
    }
  }

  // If we hit the hard limit via substring alone, return early with truncation flag
  if (substringHits.length >= limit) {
    return { matches: substringHits, truncated: totalSubstringCount > limit };
  }

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

  return { matches: [...substringHits, ...fuzzyHits], truncated: false };
}

/**
 * Transforms a raw iRail departure object into our clean API response shape.
 *
 * Defensive checks:
 *  - `delay` may arrive as `"N/A"`, `null`, or missing — we default to 0.
 *  - `time` may be missing or non-numeric — we skip invalid departures upstream.
 *
 * @param {object} rawDeparture - A departure object from iRail liveboard response
 * @returns {object|null} Normalized departure, or null if the record is unusable
 */
export function normalizeDeparture(rawDeparture) {
  // Guard: scheduled time must be a valid unix timestamp
  const rawTime = Number(rawDeparture.time);
  if (!Number.isFinite(rawTime) || rawTime <= 0) {
    console.warn('[departureService] Skipping departure with invalid time:', rawDeparture.time);
    return null;
  }

  // Guard: delay may be non-numeric (e.g. "N/A") — default to 0
  const rawDelay = Number(rawDeparture.delay ?? 0);
  const delaySeconds = Number.isFinite(rawDelay) ? rawDelay : 0;

  return {
    id: rawDeparture.departureConnection ?? rawDeparture.id ?? null,
    trainNumber: rawDeparture.vehicleinfo?.shortname ?? rawDeparture.vehicle ?? 'unknown',
    destination: rawDeparture.station ?? 'unknown',
    scheduledTime: new Date(rawTime * 1000),
    delayMinutes: delayToMinutes(delaySeconds),
    platform: rawDeparture.platforminfo?.name ?? rawDeparture.platform ?? null,
    isCancelled: rawDeparture.canceled === '1' || rawDeparture.canceled === 1,
    occupancy: rawDeparture.occupancy?.name ?? 'unknown',
  };
}

/**
 * Core orchestration function.
 *
 * Given a search query:
 * 1. Load all stations (from cache)
 * 2. Filter/match using substring + fuzzy matching
 * 3. Fetch liveboards in parallel (Promise.all)
 * 4. Filter departures to the 15-minute window
 * 5. Normalize and group by station with error isolation
 *
 * @param {string} query - Validated search query
 * @param {number} [windowMinutes] - Size of search window in minutes
 * @param {number} [maxStations] - Maximum stations to fetch
 * @returns {Promise<{ stations: Array<object>, truncated: boolean }>} Grouped station departures
 */
export async function getDeparturesForQuery(
  query,
  windowMinutes = config.irail.departureWindowMinutes,
  maxStations = config.irail.maxStationsPerQuery ?? 8
) {
  // Step 1: Get full station list
  const allStations = await getAllStations();

  // Step 2: Match stations (destructure to get truncation flag)
  const { matches, truncated } = matchStations(allStations, query, maxStations);

  if (matches.length === 0) {
    return { stations: [], truncated: false };
  }

  // Step 3: Fetch all liveboards concurrently with isolated try/catch blocks
  const liveboardResults = await Promise.all(
    matches.map(async (m) => {
      try {
        const liveboard = await getLiveboard(m.name);
        return { station: m, liveboard, error: null };
      } catch (err) {
        return {
          station: m,
          liveboard: null,
          error: err instanceof Error ? err.message : 'Failed to load departures for this station.',
        };
      }
    })
  );

  // Step 4 & 5: Filter, normalize, and group
  const now = new Date();
  const grouped = [];

  for (const { station, liveboard, error } of liveboardResults) {
    if (error) {
      grouped.push({
        station,
        departures: [],
        error,
      });
      continue;
    }

    if (!liveboard) {
      grouped.push({
        station,
        departures: [],
      });
      continue;
    }

    const rawDepartures = liveboard.departures?.departure ?? [];
    const departuresList = Array.isArray(rawDepartures) ? rawDepartures : [rawDepartures];

    const normalized = departuresList
      .map(normalizeDeparture)
      .filter(Boolean)  // drop null entries from malformed iRail records (E-6/E-7)
      .filter((dep) => {
        const delaySeconds = dep.delayMinutes * 60;
        const scheduledUnix = Math.floor(dep.scheduledTime.getTime() / 1000);
        return isWithinDepartureWindow(scheduledUnix, delaySeconds, windowMinutes, now);
      })
      .sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime());

    grouped.push({
      station,
      departures: normalized,
    });
  }

  return { stations: grouped, truncated };
}

