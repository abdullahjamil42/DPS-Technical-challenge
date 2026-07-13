import { useQuery } from '@tanstack/react-query';
import { fetchDepartures } from '../services/api.js';

/**
 * useDepartures — React Query hook for fetching departure data.
 *
 * Design decisions:
 * - `enabled: query.length >= 3` prevents any fetch until the query meets the minimum.
 *   This mirrors the backend validation and avoids a needless round-trip.
 * - `staleTime: 30_000` means data is considered fresh for 30 seconds.
 *   React Query will auto-refetch in the background when the data becomes stale,
 *   keeping the departure board live without manual polling.
 * - `retry: 1` retries once on failure (network blips) before surfacing an error.
 * - `keepPreviousData: true` keeps the last result visible while a new query loads,
 *   giving a smoother UX than flashing a loading spinner on every keystroke.
 *
 * @param {string} query - The current search query from the SearchBar
 */
export function useDepartures(query) {
  return useQuery({
    queryKey: ['departures', query],
    queryFn: () => fetchDepartures(query),
    enabled: query.length >= 3,
    staleTime: 30_000,        // 30 seconds — liveboards refresh frequently
    refetchInterval: 30_000,  // Auto-refetch every 30s for a live board feel
    retry: 1,
    placeholderData: (previousData) => previousData,
  });
}
