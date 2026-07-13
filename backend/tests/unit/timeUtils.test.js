import { describe, it, expect } from 'vitest';
import {
  formatTime,
  delayToMinutes,
  isWithinDepartureWindow,
} from '../../src/utils/timeUtils.js';

describe('formatTime', () => {
  it('formats a Unix timestamp to HH:MM', () => {
    // 2024-01-15 14:05:00 UTC → 14:05 (or local equivalent — test with a known offset)
    // Using a timestamp that yields 00:00 UTC for predictability
    const midnight = 0; // 1970-01-01T00:00:00Z
    const formatted = formatTime(midnight);
    // Accept any HH:MM — the exact value depends on the test runner's timezone
    expect(formatted).toMatch(/^\d{2}:\d{2}$/);
  });

  it('zero-pads single-digit hours and minutes', () => {
    // 2024-06-01T09:05:00Z = 1717232700 (09:05 UTC)
    const formatted = formatTime(1717232700);
    expect(formatted).toMatch(/^\d{2}:\d{2}$/);
    expect(formatted.length).toBe(5);
  });
});

describe('delayToMinutes', () => {
  it('converts seconds to minutes', () => {
    expect(delayToMinutes(300)).toBe(5);
    expect(delayToMinutes(60)).toBe(1);
    expect(delayToMinutes(0)).toBe(0);
  });

  it('floors partial minutes', () => {
    expect(delayToMinutes(90)).toBe(1); // 1.5 min → 1
    expect(delayToMinutes(59)).toBe(0); // < 1 min → 0
  });

  it('handles string input (as returned by iRail)', () => {
    expect(delayToMinutes('300')).toBe(5);
    expect(delayToMinutes('0')).toBe(0);
  });
});

describe('isWithinDepartureWindow', () => {
  const now = new Date('2024-06-01T14:00:00Z');
  const nowUnix = Math.floor(now.getTime() / 1000);
  const windowMinutes = 15;

  it('includes a train departing exactly now', () => {
    expect(isWithinDepartureWindow(nowUnix, 0, windowMinutes, now)).toBe(true);
  });

  it('includes a train departing in 10 minutes', () => {
    const in10Minutes = nowUnix + 10 * 60;
    expect(isWithinDepartureWindow(in10Minutes, 0, windowMinutes, now)).toBe(true);
  });

  it('includes a train at exactly the 15-minute boundary', () => {
    const in15Minutes = nowUnix + 15 * 60;
    expect(isWithinDepartureWindow(in15Minutes, 0, windowMinutes, now)).toBe(true);
  });

  it('excludes a train departing in 16 minutes', () => {
    const in16Minutes = nowUnix + 16 * 60;
    expect(isWithinDepartureWindow(in16Minutes, 0, windowMinutes, now)).toBe(false);
  });

  it('excludes a train that already departed 1 minute ago', () => {
    const oneMinuteAgo = nowUnix - 60;
    expect(isWithinDepartureWindow(oneMinuteAgo, 0, windowMinutes, now)).toBe(false);
  });

  it('includes a delayed train whose effective departure falls in the window', () => {
    // Scheduled 20 min from now, but delayed by 600s (10min) → effective = 10 min out
    // Wait — 20min from now MINUS 10min delay = effective 10min? No.
    // Scheduled 20min from now + 0 delay = 20min → excluded
    // But scheduled 10min from now + 5min delay = 15min → included
    const in10Minutes = nowUnix + 10 * 60;
    const delaySeconds = 5 * 60; // 5 min delay → effective = 15 min from now
    expect(isWithinDepartureWindow(in10Minutes, delaySeconds, windowMinutes, now)).toBe(true);
  });

  it('excludes a delayed train whose effective departure exceeds the window', () => {
    const in10Minutes = nowUnix + 10 * 60;
    const delaySeconds = 10 * 60; // 10 min delay → effective = 20 min from now
    expect(isWithinDepartureWindow(in10Minutes, delaySeconds, windowMinutes, now)).toBe(false);
  });
});
