/**
 * API service — thin fetch wrapper.
 *
 * The base URL is empty in development (Vite proxy forwards /departures to :3001).
 * In production, set VITE_API_BASE_URL to the deployed backend URL.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

/**
 * Fetches departures for a given search query.
 *
 * @param {string} query - Search query (must be >= 3 chars; validated before calling)
 * @returns {Promise<{query: string, fetchedAt: string, stationCount: number, stations: Array}>}
 * @throws {Error} With a user-friendly message on failure
 */
export async function fetchDepartures(query) {
  const url = `${BASE_URL}/departures?q=${encodeURIComponent(query)}`;

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  const data = await response.json();

  if (!response.ok) {
    // Surface the structured error code from the backend
    const err = new Error(data.message || 'Failed to fetch departures.');
    err.code = data.error;
    err.statusCode = response.status;
    throw err;
  }

  return data;
}
