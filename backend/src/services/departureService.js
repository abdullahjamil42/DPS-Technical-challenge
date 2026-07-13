import { getAllStations, getLiveboard } from './irailService.js';
import { formatTime, delayToMinutes, isWithinDepartureWindow } from '../utils/timeUtils.js';
import { config } from '../config.js';

/**
 * Departure Service — pure business logic layer.
 *
 * This module contains zero HTTP concerns. It receives raw iRail data
 * and applies the domain rules specified in the challenge brief:
 *
 *  1. Station matching: case-insensitive substring search
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
 * @param {string} query - User search query (already validated >= 3 chars)
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
 * Transforms a raw iRail departure object into our clean API response shape.
 *
 * @param {object} rawDeparture - A departure object from iRail liveboard response
 * @returns {object} Normalized departure
 */
export function normalizeDeparture(rawDeparture) {
  const delaySeconds = Number(rawDeparture.delay ?? 0);
  const scheduledTime = Number(rawDeparture.time);

  return {
    id: rawDeparture.departureConnection ?? rawDeparture.id,
    trainNumber: rawDeparture.vehicleinfo?.shortname ?? rawDeparture.vehicle,
    destination: rawDeparture.station,
    scheduledDepartureTime: formatTime(scheduledTime),
    delayMinutes: delayToMinutes(delaySeconds),
    platform: rawDeparture.platforminfo?.name ?? rawDeparture.platform ?? null,
    isCancelled: rawDeparture.canceled === '1' || rawDeparture.canceled === 1,
    occupancy: rawDeparture.occupancy?.name ?? 'unknown',
    // Raw scheduled time kept for window filtering (already done, but useful for clients)
    _scheduledUnix: scheduledTime,
  };
}

/**
 * Core orchestration function.
 *
 * Given a search query:
 * 1. Load all stations (from cache)
 * 2. Filter to those matching the query
 * 3. Fetch liveboards in parallel (Promise.all)
 * 4. Filter departures to the 15-minute window
 * 5. Normalize and group by station
 *
 * Stations that fail to return a liveboard (network error) are omitted
 * from the result rather than causing the entire request to fail.
 * This is a deliberate graceful-degradation decision.
 *
 * @param {string} query - Validated search query (>= 3 chars)
 * @returns {Promise<Array<StationDepartures>>}
 */
export async function getDeparturesForQuery(query) {
  // Step 1: Get full station list (served from cache in the common case)
  const allStations = await getAllStations();

  // Step 2: Find matching stations
  const matchedStations = filterStationsByQuery(allStations, query);

  if (matchedStations.length === 0) {
    return [];
  }

  // Step 3: Fetch all liveboards concurrently — crucial for performance
  // when multiple stations match (e.g., "Bru" matches multiple Brussels stations)
  const liveboardResults = await Promise.all(
    matchedStations.map(async (station) => {
      const liveboard = await getLiveboard(station.standardname);
      return { station, liveboard };
    })
  );

  // Step 4 & 5: Filter, normalize, and group
  const now = new Date();
  const grouped = [];

  for (const { station, liveboard } of liveboardResults) {
    if (!liveboard) continue; // Station fetch failed — degrade gracefully

    const rawDepartures = liveboard.departures?.departure ?? [];

    // Normalize all departures
    const allDepartures = Array.isArray(rawDepartures)
      ? rawDepartures.map(normalizeDeparture)
      : [normalizeDeparture(rawDepartures)];

    // Apply the 15-minute departure window filter
    const upcomingDepartures = allDepartures.filter((dep) => {
      // Cancelled trains are included (they still appear on real departure boards)
      const delaySeconds = dep.delayMinutes * 60;
      return isWithinDepartureWindow(
        dep._scheduledUnix,
        delaySeconds,
        config.irail.departureWindowMinutes,
        now
      );
    });

    // Only include a station if it has departures in the window
    if (upcomingDepartures.length > 0) {
      grouped.push({
        stationName: liveboard.station ?? station.standardname,
        stationId: station.id,
        departures: upcomingDepartures,
      });
    }
  }

  return grouped;
}
