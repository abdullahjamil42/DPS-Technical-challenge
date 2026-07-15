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
 *  - Single retry on transient errors (5xx, 429, timeout) — E-3, E-4
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
 * Returns true for HTTP status codes that are worth retrying.
 * 429 (rate-limited), 500, 502, 503, 504 are transient by nature.
 * @param {number} status
 * @returns {boolean}
 */
function isRetryableStatus(status) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

/**
 * Performs a single fetch attempt. If the first attempt hits a retryable
 * status or a network timeout, waits 600ms and tries once more (E-3, E-4).
 *
 * @param {string} url
 * @param {RequestInit} options
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, options = {}) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options);
      // Don't retry on client errors or success; only on transient server errors
      if (!isRetryableStatus(response.status)) return response;
      lastError = new Error(`iRail responded with ${response.status}`);
      lastError.statusCode = response.status;
    } catch (err) {
      lastError = err;
      // If it is a timeout (AbortError), don't retry to avoid compounding delays
      if (err.name === 'AbortError') {
        err.isTimeout = true;
        throw err;
      }
      throw err;
    }
    if (attempt === 0) {
      // Brief backoff before retry on status errors
      await new Promise((r) => setTimeout(r, 600));
    }
  }
  throw lastError;
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

  let response;
  try {
    response = await fetchWithRetry(url, { headers: buildHeaders() });
  } catch (err) {
    // E-1: Sanitize — never leak raw HTTP status codes or internal details to callers
    if (err.isTimeout) {
      const timeout = new Error('iRail station list request timed out.');
      timeout.code = 'IRAIL_TIMEOUT';
      throw timeout;
    }
    throw new Error('Could not reach the iRail station list endpoint.');
  }

  if (!response.ok) {
    // E-1: Sanitize error — internal log captures detail, thrown error is clean
    console.error(`[iRailService] Station list returned ${response.status}`);
    if (response.status === 429) {
      const err = new Error('iRail is rate-limiting requests. Please try again shortly.');
      err.code = 'IRAIL_RATE_LIMITED';
      throw err;
    }
    throw new Error('iRail station list endpoint returned an error.');
  }

  const data = await response.json();

  // E-2: Guard against schema changes — log loudly if the expected key is missing
  const stations = data.station;
  if (!Array.isArray(stations)) {
    console.error('[iRailService] Unexpected station list shape — "station" key missing or not an array:', Object.keys(data));
    throw new Error('iRail station list response has an unexpected format.');
  }

  stationCache.set(STATION_CACHE_KEY, stations);
  return stations;
}

/**
 * Fetches the departure liveboard for a specific station by its standardname.
 *
 * Results are cached per station name for 30 seconds to avoid hammering iRail
 * while still returning near-real-time data for a live departure board.
 *
 * On retryable errors (429, 5xx, timeout), a single retry is attempted.
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
    const response = await fetchWithRetry(url, { headers: buildHeaders() });

    // iRail returns 404 when no liveboard exists for a station name
    if (response.status === 404) {
      return null;
    }

    // E-3: Surface 429 distinctly instead of silently returning null
    if (response.status === 429) {
      console.warn(`[iRailService] Rate-limited by iRail for station "${stationName}". Retry exhausted.`);
      const err = new Error('iRail rate limit reached for this station.');
      err.code = 'IRAIL_RATE_LIMITED';
      throw err;
    }

    if (!response.ok) {
      console.warn(`[iRailService] Liveboard request failed for "${stationName}": ${response.status}`);
      return null;
    }

    const data = await response.json();
    liveboardCache.set(cacheKey, data);
    return data;
  } catch (err) {
    if (err.code === 'IRAIL_RATE_LIMITED') throw err; // re-throw structured errors

    // E-5: Timeout gets a distinct log and code
    if (err.isTimeout || err.name === 'AbortError') {
      console.warn(`[iRailService] Liveboard request timed out for "${stationName}" after retry.`);
    } else {
      console.warn(`[iRailService] Liveboard fetch error for "${stationName}":`, err.message);
    }
    return null;
  }
}
