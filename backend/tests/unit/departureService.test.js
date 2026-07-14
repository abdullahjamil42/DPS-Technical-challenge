import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/irailService.js', () => ({
  getAllStations: vi.fn(),
  getLiveboard: vi.fn(),
}));

import { getAllStations, getLiveboard } from '../../src/services/irailService.js';
import {
  filterStationsByQuery,
  matchStations,
  normalizeDeparture,
  getDeparturesForQuery,
} from '../../src/services/departureService.js';

// ── Test Fixtures ──────────────────────────────────────────────────────────────

const MOCK_STATIONS = [
  { id: 'BE.NMBS.008813003', name: 'Brussels-Central', standardname: 'Brussel-Centraal' },
  { id: 'BE.NMBS.008814001', name: 'Brussels-South', standardname: 'Brussel-Zuid' },
  { id: 'BE.NMBS.008821006', name: 'Antwerp-Central', standardname: 'Antwerpen-Centraal' },
  { id: 'BE.NMBS.008892007', name: 'Ghent-Sint-Pieters', standardname: 'Gent-Sint-Pieters' },
  { id: 'BE.NMBS.008891009', name: 'Bruges', standardname: 'Brugge' },
];

const MOCK_RAW_DEPARTURE = {
  id: 0,
  delay: '300', // 5 minutes, as a string (iRail quirk)
  station: 'Antwerp-Central',
  stationinfo: { id: 'BE.NMBS.008821006', standardname: 'Antwerpen-Centraal' },
  time: '1717232700', // some Unix timestamp
  vehicle: 'BE.NMBS.IC3033',
  vehicleinfo: { name: 'BE.NMBS.IC3033', shortname: 'IC3033' },
  platform: '4',
  platforminfo: { name: '4', normal: '1' },
  canceled: '0',
  departureConnection: 'http://irail.be/connections/8813003/20240601/IC3033',
  occupancy: { name: 'low', '@id': 'http://api.irail.be/terms/low' },
};

// ── filterStationsByQuery ──────────────────────────────────────────────────────

describe('filterStationsByQuery', () => {
  it('returns stations matching query in the name field', () => {
    const results = filterStationsByQuery(MOCK_STATIONS, 'Bru');
    const names = results.map((s) => s.name);
    expect(names).toContain('Brussels-Central');
    expect(names).toContain('Brussels-South');
  });

  it('returns stations matching query in the standardname field', () => {
    const results = filterStationsByQuery(MOCK_STATIONS, 'Antwerpen');
    expect(results).toHaveLength(1);
    expect(results[0].standardname).toBe('Antwerpen-Centraal');
  });

  it('is case-insensitive', () => {
    const upper = filterStationsByQuery(MOCK_STATIONS, 'BRUSSELS');
    const lower = filterStationsByQuery(MOCK_STATIONS, 'brussels');
    expect(upper).toHaveLength(lower.length);
    expect(upper.map((s) => s.id)).toEqual(lower.map((s) => s.id));
  });

  it('returns empty array when no stations match', () => {
    const results = filterStationsByQuery(MOCK_STATIONS, 'xyz_no_match');
    expect(results).toHaveLength(0);
  });

  it('matches a single letter correctly when 3+ chars provided', () => {
    const results = filterStationsByQuery(MOCK_STATIONS, 'Gen');
    expect(results[0].name).toBe('Ghent-Sint-Pieters');
  });

  it('handles empty station list gracefully', () => {
    expect(filterStationsByQuery([], 'Bru')).toHaveLength(0);
  });
});

// ── matchStations ──────────────────────────────────────────────────────────────

describe('matchStations', () => {
  it('matches by substring first', () => {
    const results = matchStations(MOCK_STATIONS, 'Bru', 5);
    expect(results).toHaveLength(3); // 'Brussels-Central', 'Brussels-South', 'Bruges'
    expect(results[0].matchType).toBe('substring');
    expect(results[0].name).toBe('Brussels-Central');
  });

  it('falls back to fuzzy matching for typos', () => {
    const results = matchStations(MOCK_STATIONS, 'Brusels', 5);
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results[0].matchType).toBe('fuzzy');
    const names = results.map((r) => r.name);
    expect(names).toContain('Brussels-Central');
    expect(names).toContain('Brussels-South');
  });

  it('caps results at the limit', () => {
    const results = matchStations(MOCK_STATIONS, 'Bru', 1);
    expect(results).toHaveLength(1);
  });
});

// ── normalizeDeparture ─────────────────────────────────────────────────────────

describe('normalizeDeparture', () => {
  it('extracts the train short number from vehicleinfo', () => {
    const result = normalizeDeparture(MOCK_RAW_DEPARTURE);
    expect(result.trainNumber).toBe('IC3033');
  });

  it('converts delay from seconds string to minutes number', () => {
    const result = normalizeDeparture(MOCK_RAW_DEPARTURE);
    expect(result.delayMinutes).toBe(5); // 300s = 5min
  });

  it('formats the scheduled departure time as Date object', () => {
    const result = normalizeDeparture(MOCK_RAW_DEPARTURE);
    expect(result.scheduledTime).toBeInstanceOf(Date);
    expect(result.scheduledTime.getTime()).toBe(1717232700 * 1000);
  });

  it('correctly sets isCancelled to false for canceled:"0"', () => {
    const result = normalizeDeparture(MOCK_RAW_DEPARTURE);
    expect(result.isCancelled).toBe(false);
  });

  it('correctly sets isCancelled to true for canceled:"1"', () => {
    const cancelled = { ...MOCK_RAW_DEPARTURE, canceled: '1' };
    const result = normalizeDeparture(cancelled);
    expect(result.isCancelled).toBe(true);
  });

  it('handles numeric canceled field', () => {
    const cancelled = { ...MOCK_RAW_DEPARTURE, canceled: 1 };
    expect(normalizeDeparture(cancelled).isCancelled).toBe(true);
  });

  it('extracts platform from platforminfo or platform', () => {
    const result = normalizeDeparture(MOCK_RAW_DEPARTURE);
    expect(result.platform).toBe('4');
  });

  it('extracts occupancy name', () => {
    const result = normalizeDeparture(MOCK_RAW_DEPARTURE);
    expect(result.occupancy).toBe('low');
  });

  it('uses departureConnection as the departure id', () => {
    const result = normalizeDeparture(MOCK_RAW_DEPARTURE);
    expect(result.id).toBe('http://irail.be/connections/8813003/20240601/IC3033');
  });

  it('handles missing delay (defaults to 0)', () => {
    const noDelay = { ...MOCK_RAW_DEPARTURE, delay: undefined };
    const result = normalizeDeparture(noDelay);
    expect(result.delayMinutes).toBe(0);
  });

  it('handles missing occupancy (defaults to "unknown")', () => {
    const noOccupancy = { ...MOCK_RAW_DEPARTURE, occupancy: undefined };
    const result = normalizeDeparture(noOccupancy);
    expect(result.occupancy).toBe('unknown');
  });
});

// ── getDeparturesForQuery ──────────────────────────────────────────────────────

describe('getDeparturesForQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array if query has no matches', async () => {
    getAllStations.mockResolvedValue(MOCK_STATIONS);
    const result = await getDeparturesForQuery('xyz_no_match');
    expect(result).toEqual([]);
  });

  it('fetches departures and normalizes them within window', async () => {
    getAllStations.mockResolvedValue(MOCK_STATIONS);
    getLiveboard.mockImplementation((name) => {
      if (name === 'Gent-Sint-Pieters' || name === 'Ghent-Sint-Pieters') {
        return Promise.resolve({
          station: 'Ghent-Sint-Pieters',
          departures: {
            departure: [
              {
                id: '1',
                vehicle: 'IC123',
                station: 'Antwerp-Central',
                time: String(Math.floor(Date.now() / 1000) + 300), // 5 min in future
                delay: '0',
                canceled: '0',
              },
              {
                id: '2',
                vehicle: 'IC456',
                station: 'Ghent-Sint-Pieters',
                time: String(Math.floor(Date.now() / 1000) + 1200), // 20 min in future
                delay: '0',
                canceled: '0',
              },
            ],
          },
        });
      }
      return Promise.resolve(null);
    });

    const result = await getDeparturesForQuery('Gent-Sint-Pieters');
    expect(result).toHaveLength(1);
    expect(result[0].station.name).toBe('Ghent-Sint-Pieters');
    expect(result[0].departures).toHaveLength(1);
    expect(result[0].departures[0].trainNumber).toBe('IC123');
  });

  it('handles single station error gracefully by isolating it', async () => {
    getAllStations.mockResolvedValue(MOCK_STATIONS);
    getLiveboard.mockRejectedValue(new Error('Network Error'));

    const result = await getDeparturesForQuery('Gent-Sint-Pieters');
    expect(result).toHaveLength(1);
    expect(result[0].departures).toHaveLength(0);
    expect(result[0].error).toBe('Network Error');
  });
});

