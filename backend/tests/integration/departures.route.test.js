import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../../src/app.js';

/**
 * Integration tests for GET /departures
 *
 * We mock the entire departureService module so that these tests
 * verify HTTP concerns (status codes, response shapes, validation)
 * without making real network calls to iRail.
 *
 * The service-level logic is tested in unit tests.
 */

vi.mock('../../src/services/departureService.js', () => ({
  getDeparturesForQuery: vi.fn(),
}));

// Import the mock AFTER vi.mock hoisting
import { getDeparturesForQuery } from '../../src/services/departureService.js';

const MOCK_STATION_RESULT = [
  {
    stationName: 'Brussels-Central',
    stationId: 'BE.NMBS.008813003',
    departures: [
      {
        id: 'http://irail.be/connections/8813003/20240601/IC532',
        trainNumber: 'IC532',
        destination: 'Antwerp-Central',
        scheduledDepartureTime: '14:05',
        delayMinutes: 3,
        platform: '4',
        isCancelled: false,
        occupancy: 'low',
        _scheduledUnix: 1717232700,
      },
    ],
  },
];

describe('GET /departures', () => {
  let request;

  beforeEach(() => {
    const app = createApp();
    request = supertest(app);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── Validation ───────────────────────────────────────────────────────────

  it('returns 400 QUERY_TOO_SHORT when q has 1 character', async () => {
    const res = await request.get('/departures?q=B');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('QUERY_TOO_SHORT');
    expect(res.body.minLength).toBe(3);
    expect(res.body.received).toBe(1);
  });

  it('returns 400 QUERY_TOO_SHORT when q has 2 characters', async () => {
    const res = await request.get('/departures?q=Br');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('QUERY_TOO_SHORT');
    expect(res.body.received).toBe(2);
  });

  it('returns 400 MISSING_QUERY when q is absent', async () => {
    const res = await request.get('/departures');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('MISSING_QUERY');
  });

  // ── Happy Path ───────────────────────────────────────────────────────────

  it('returns 200 with station data for a valid query', async () => {
    getDeparturesForQuery.mockResolvedValue(MOCK_STATION_RESULT);

    const res = await request.get('/departures?q=Bru');
    expect(res.status).toBe(200);
    expect(res.body.query).toBe('Bru');
    expect(res.body.stations).toHaveLength(1);
    expect(res.body.stationCount).toBe(1);
    expect(res.body.fetchedAt).toBeDefined();
  });

  it('response station contains required departure fields', async () => {
    getDeparturesForQuery.mockResolvedValue(MOCK_STATION_RESULT);

    const res = await request.get('/departures?q=Bru');
    const departure = res.body.stations[0].departures[0];

    expect(departure).toHaveProperty('trainNumber', 'IC532');
    expect(departure).toHaveProperty('destination', 'Antwerp-Central');
    expect(departure).toHaveProperty('scheduledDepartureTime', '14:05');
    expect(departure).toHaveProperty('delayMinutes', 3);
    expect(departure).toHaveProperty('isCancelled', false);
  });

  it('returns empty stations array when no stations match', async () => {
    getDeparturesForQuery.mockResolvedValue([]);

    const res = await request.get('/departures?q=xyz');
    expect(res.status).toBe(200);
    expect(res.body.stations).toHaveLength(0);
    expect(res.body.stationCount).toBe(0);
  });

  it('accepts a 3-character query (minimum valid)', async () => {
    getDeparturesForQuery.mockResolvedValue([]);
    const res = await request.get('/departures?q=Bru');
    expect(res.status).toBe(200);
  });

  // ── Error Handling ────────────────────────────────────────────────────────

  it('returns 503 when the service throws an unexpected error', async () => {
    getDeparturesForQuery.mockRejectedValue(new Error('iRail network failure'));

    const res = await request.get('/departures?q=Bru');
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('IRAIL_UNAVAILABLE');
  });

  // ── Health Check ─────────────────────────────────────────────────────────

  it('GET /health returns 200 with ok status', async () => {
    const res = await request.get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  // ── 404 for unknown routes ────────────────────────────────────────────────

  it('returns 404 for unknown routes', async () => {
    const res = await request.get('/unknown-route');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });
});
