/**
 * Unit tests for departureService.js pure functions.
 *
 * These tests are completely isolated — no network calls are made.
 * All iRail interactions are either mocked or not invoked (for pure functions).
 */

import { describe, it, expect } from 'vitest';
import {
  filterStationsByQuery,
  matchStations,
  normalizeDeparture,
} from '../src/services/departureService.js';
import { isWithinDepartureWindow, delayToMinutes, formatTime } from '../src/utils/timeUtils.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STATIONS = [
  { id: 'BE.NMBS.008814001', name: 'Brussel-Centraal',  standardname: 'Bruxelles-Central' },
  { id: 'BE.NMBS.008812005', name: 'Brussel-Noord',     standardname: 'Bruxelles-Nord'    },
  { id: 'BE.NMBS.008892007', name: 'Antwerpen-Centraal',standardname: 'Anvers-Central'    },
  { id: 'BE.NMBS.008892601', name: 'Antwerpen-Berchem', standardname: 'Anvers-Berchem'    },
  { id: 'BE.NMBS.008821006', name: 'Gent-Sint-Pieters', standardname: 'Gand-Saint-Pierre' },
  { id: 'BE.NMBS.008891405', name: 'Liège-Guillemins',  standardname: 'Luik-Guillemins'   },
];

/** Unix timestamp for "now" fixed at a known moment for deterministic tests */
const NOW_UNIX = 1_700_000_000; // 2023-11-14T22:13:20Z
const NOW = new Date(NOW_UNIX * 1000);

/** Builds a minimal raw iRail departure object */
function rawDep(overrides = {}) {
  return {
    time: String(NOW_UNIX + 5 * 60), // 5 minutes from now
    delay: '0',
    vehicle: 'BE.NMBS.IC1234',
    vehicleinfo: { shortname: 'IC 1234' },
    station: 'Gent-Sint-Pieters',
    departureConnection: 'http://example.com/dep/1',
    platform: '4',
    platforminfo: { name: '4' },
    canceled: '0',
    occupancy: { name: 'low' },
    ...overrides,
  };
}

// ── filterStationsByQuery ─────────────────────────────────────────────────────

describe('filterStationsByQuery', () => {
  it('returns stations matching the name substring (case-insensitive)', () => {
    const result = filterStationsByQuery(STATIONS, 'bru');
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.name)).toEqual(
      expect.arrayContaining(['Brussel-Centraal', 'Brussel-Noord'])
    );
  });

  it('matches on standardname field (e.g. French names)', () => {
    const result = filterStationsByQuery(STATIONS, 'Anvers');
    expect(result).toHaveLength(2);
    expect(result.every((s) => s.standardname.includes('Anvers'))).toBe(true);
  });

  it('returns empty array when no station matches', () => {
    expect(filterStationsByQuery(STATIONS, 'ZZZNOTREAL')).toEqual([]);
  });

  it('is case-insensitive for both name and standardname', () => {
    expect(filterStationsByQuery(STATIONS, 'GENT')).toHaveLength(1);
    expect(filterStationsByQuery(STATIONS, 'gand')).toHaveLength(1);
  });

  it('returns all stations when query matches all (empty-ish query)', () => {
    // 'e' appears in every station name
    const result = filterStationsByQuery(STATIONS, 'e');
    expect(result.length).toBeGreaterThanOrEqual(4);
  });
});

// ── matchStations ─────────────────────────────────────────────────────────────

describe('matchStations', () => {
  it('returns substring matches with matchType "substring"', () => {
    const { matches } = matchStations(STATIONS, 'Antwerpen');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((m) => m.matchType === 'substring')).toBe(true);
  });

  it('returns { matches, truncated } shape', () => {
    const result = matchStations(STATIONS, 'Bru');
    expect(result).toHaveProperty('matches');
    expect(result).toHaveProperty('truncated');
    expect(Array.isArray(result.matches)).toBe(true);
    expect(typeof result.truncated).toBe('boolean');
  });

  it('sets truncated=true when more substring matches exist than the limit', () => {
    // All 6 stations contain 'e' — limit of 2 should trigger truncation
    const { matches, truncated } = matchStations(STATIONS, 'e', 2);
    expect(matches).toHaveLength(2);
    expect(truncated).toBe(true);
  });

  it('sets truncated=false when results fit within the limit', () => {
    const { truncated } = matchStations(STATIONS, 'Gent', 8);
    expect(truncated).toBe(false);
  });

  it('fuzzy-matches typos via Fuse.js', () => {
    // "Antverpen" (typo) should fuzzy-match Antwerpen stations
    const { matches } = matchStations(STATIONS, 'Antverpen', 8);
    const names = matches.map((m) => m.name);
    expect(names.some((n) => n.includes('Antwerpen'))).toBe(true);
    // At least the fuzzy matches should be tagged
    expect(matches.some((m) => m.matchType === 'fuzzy')).toBe(true);
  });

  it('returns empty matches array when nothing matches', () => {
    const { matches, truncated } = matchStations(STATIONS, 'ZZZNOTREAL', 8);
    expect(matches).toEqual([]);
    expect(truncated).toBe(false);
  });

  it('does not duplicate stations between substring and fuzzy results', () => {
    const { matches } = matchStations(STATIONS, 'Bru', 8);
    const ids = matches.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicates
  });
});

// ── normalizeDeparture ────────────────────────────────────────────────────────

describe('normalizeDeparture', () => {
  it('normalizes a well-formed iRail departure correctly', () => {
    const result = normalizeDeparture(rawDep());
    expect(result).not.toBeNull();
    expect(result.trainNumber).toBe('IC 1234');
    expect(result.destination).toBe('Gent-Sint-Pieters');
    expect(result.platform).toBe('4');
    expect(result.isCancelled).toBe(false);
    expect(result.delayMinutes).toBe(0);
    expect(result.scheduledTime).toBeInstanceOf(Date);
    expect(result.occupancy).toBe('low');
  });

  it('returns null for a departure with missing/invalid time (E-7)', () => {
    expect(normalizeDeparture(rawDep({ time: undefined }))).toBeNull();
    expect(normalizeDeparture(rawDep({ time: 'NOT_A_NUMBER' }))).toBeNull();
    expect(normalizeDeparture(rawDep({ time: '0' }))).toBeNull(); // zero is not valid
  });

  it('defaults delay to 0 when delay is "N/A" or null (E-6)', () => {
    const r1 = normalizeDeparture(rawDep({ delay: 'N/A' }));
    const r2 = normalizeDeparture(rawDep({ delay: null }));
    expect(r1?.delayMinutes).toBe(0);
    expect(r2?.delayMinutes).toBe(0);
  });

  it('correctly converts delay seconds to minutes', () => {
    const result = normalizeDeparture(rawDep({ delay: '360' })); // 6 minutes
    expect(result?.delayMinutes).toBe(6);
  });

  it('detects cancellation from canceled="1"', () => {
    const result = normalizeDeparture(rawDep({ canceled: '1' }));
    expect(result?.isCancelled).toBe(true);
  });

  it('detects cancellation from canceled=1 (numeric)', () => {
    const result = normalizeDeparture(rawDep({ canceled: 1 }));
    expect(result?.isCancelled).toBe(true);
  });

  it('falls back to vehicle when vehicleinfo.shortname is missing', () => {
    const result = normalizeDeparture(rawDep({ vehicleinfo: undefined, vehicle: 'BE.NMBS.IC999' }));
    expect(result?.trainNumber).toBe('BE.NMBS.IC999');
  });

  it('uses platforminfo.name when available', () => {
    const result = normalizeDeparture(rawDep({ platforminfo: { name: '7A' }, platform: '7' }));
    expect(result?.platform).toBe('7A');
  });
});

// ── isWithinDepartureWindow ───────────────────────────────────────────────────

describe('isWithinDepartureWindow', () => {
  it('includes a departure scheduled exactly at NOW', () => {
    expect(isWithinDepartureWindow(NOW_UNIX, 0, 15, NOW)).toBe(true);
  });

  it('includes a departure at the end of the window', () => {
    expect(isWithinDepartureWindow(NOW_UNIX + 15 * 60, 0, 15, NOW)).toBe(true);
  });

  it('excludes a departure one second after the window', () => {
    expect(isWithinDepartureWindow(NOW_UNIX + 15 * 60 + 1, 0, 15, NOW)).toBe(false);
  });

  it('excludes a departure that has already left (one second ago)', () => {
    expect(isWithinDepartureWindow(NOW_UNIX - 1, 0, 15, NOW)).toBe(false);
  });

  it('accounts for delay when computing effective departure time', () => {
    // Scheduled 14 minutes ago, but delayed by 20 minutes → effective = NOW + 6min
    const scheduled = NOW_UNIX - 14 * 60;
    const delay = 20 * 60; // 20 minutes in seconds
    expect(isWithinDepartureWindow(scheduled, delay, 15, NOW)).toBe(true);
  });

  it('works with the default "now" when no reference date is provided', () => {
    // A departure 5 minutes in the future should be within 15 min
    const future = Math.floor(Date.now() / 1000) + 5 * 60;
    expect(isWithinDepartureWindow(future, 0, 15)).toBe(true);
  });
});

// ── delayToMinutes ────────────────────────────────────────────────────────────

describe('delayToMinutes', () => {
  it('converts full seconds to floored minutes', () => {
    expect(delayToMinutes(300)).toBe(5);
    expect(delayToMinutes(359)).toBe(5); // floors, not rounds
    expect(delayToMinutes(360)).toBe(6);
  });

  it('returns 0 for 0 seconds', () => {
    expect(delayToMinutes(0)).toBe(0);
  });

  it('handles string input (as iRail sends it)', () => {
    expect(delayToMinutes('120')).toBe(2);
  });
});

// ── formatTime ────────────────────────────────────────────────────────────────

describe('formatTime', () => {
  it('formats a unix timestamp as HH:MM', () => {
    // 2023-11-14T22:13:20Z = 22:13 UTC
    const result = formatTime(NOW_UNIX);
    // We only check the pattern since the exact hour depends on local timezone
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });

  it('zero-pads hours and minutes', () => {
    // 00:01 in UTC = 60 seconds from midnight UTC
    // We can't predict local time, but we can verify the pattern holds for any input
    const result = formatTime(NOW_UNIX);
    const [h, m] = result.split(':');
    expect(h.length).toBe(2);
    expect(m.length).toBe(2);
  });
});
