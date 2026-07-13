import NodeCache from 'node-cache';
import { config } from '../config.js';

/**
 * iRail Service — responsible for all communication with the iRail API.
 *
 * Concerns:
 *  - Fetching the full Belgian station list (cached for 1 hour)
 *  - Fetching a liveboard for a specific station (cached for 30s)
 *  - Setting correct request headers (User-Agent, Accept)
 *  - Handling network errors and iRail-specific failures
 *
 * This service is intentionally kept free of business logic.
 * It only fetches and normalizes raw iRail data.
 */

const stationCache = new NodeCache({ stdTTL: config.irail.stationCacheTtlSeconds });
const liveboardCache = new NodeCache({ stdTTL: config.irail.liveboardCacheTtlSeconds });

const STATION_CACHE_KEY = 'ALL_STATIONS';

/**
 * Builds common request headers for all iRail API requests.
 */
function buildHeaders() {
  return {
    Accept: 'application/json',
    'User-Agent': config.irail.userAgent,
  };
}

/**
 * Wraps fetch with a timeout signal.
 * @param {string} url
 * @param {RequestInit} options
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.irail.requestTimeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetches and caches the complete list of Belgian railway stations from iRail.
 *
 * Station list is stable (changes infrequently), so we cache it for 1 hour.
 * This avoids redundant network calls on every search.
 *
 * @returns {Promise<Array<{id: string, name: string, standardname: string}>>}
 */
export async function getAllStations() {
  const cached = stationCache.get(STATION_CACHE_KEY);
  if (cached) {
    return cached;
  }

  const url = `${config.irail.baseUrl}/stations/?format=json&lang=en`;
  const response = await fetchWithTimeout(url, { headers: buildHeaders() });

  if (!response.ok) {
    throw new Error(`iRail stations endpoint returned ${response.status}`);
  }

  const data = await response.json();
  const stations = data.station || [];

  stationCache.set(STATION_CACHE_KEY, stations);
  return stations;
}

/**
 * Fetches the departure liveboard for a specific station by its standardname.
 *
 * Results are cached per station name for 30 seconds to avoid hammering iRail
 * while still returning near-real-time data for a live departure board.
 *
 * @param {string} stationName - The station's standardname (e.g. "Brussel-Centraal")
 * @returns {Promise<object|null>} Raw iRail liveboard response, or null on failure
 */
export async function getLiveboard(stationName) {
  const cacheKey = `liveboard:${stationName}`;
  const cached = liveboardCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const params = new URLSearchParams({
    station: stationName,
    arrdep: 'departure',
    format: 'json',
    lang: 'en',
    alerts: 'false',
  });

  const url = `${config.irail.baseUrl}/liveboard/?${params.toString()}`;

  try {
    const response = await fetchWithTimeout(url, { headers: buildHeaders() });

    // iRail returns 404 when no liveboard exists for a station name
    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      console.warn(`[iRailService] Liveboard request failed for "${stationName}": ${response.status}`);
      return null;
    }

    const data = await response.json();
    liveboardCache.set(cacheKey, data);
    return data;
  } catch (err) {
    // Network timeout or connection refused — degrade gracefully
    if (err.name === 'AbortError') {
      console.warn(`[iRailService] Liveboard request timed out for "${stationName}"`);
    } else {
      console.warn(`[iRailService] Liveboard fetch error for "${stationName}":`, err.message);
    }
    return null;
  }
}
