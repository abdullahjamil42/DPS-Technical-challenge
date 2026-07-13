/**
 * Time utility functions.
 *
 * iRail returns departure times as Unix timestamps (seconds).
 * These utilities convert them to human-readable formats and
 * compute relative time differences.
 */

/**
 * Converts a Unix timestamp (seconds) to a "HH:MM" formatted string.
 * @param {number} unixSeconds - Unix timestamp in seconds
 * @returns {string} Time formatted as "HH:MM"
 */
export function formatTime(unixSeconds) {
  const date = new Date(unixSeconds * 1000);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Converts a delay value (in seconds, as returned by iRail) to minutes.
 * @param {number|string} delaySeconds - Delay in seconds
 * @returns {number} Delay in minutes (floored)
 */
export function delayToMinutes(delaySeconds) {
  return Math.floor(Number(delaySeconds) / 60);
}

/**
 * Determines if a departure (by scheduled time + delay) falls within
 * the specified window from a reference time.
 *
 * @param {number} scheduledUnixSeconds - Scheduled departure time (Unix seconds)
 * @param {number} delaySeconds - Train delay in seconds
 * @param {number} windowMinutes - How many minutes ahead to include
 * @param {Date} [referenceDate] - Reference point (defaults to now)
 * @returns {boolean}
 */
export function isWithinDepartureWindow(
  scheduledUnixSeconds,
  delaySeconds,
  windowMinutes,
  referenceDate = new Date()
) {
  const effectiveDepartureMs = (Number(scheduledUnixSeconds) + Number(delaySeconds)) * 1000;
  const nowMs = referenceDate.getTime();
  const windowMs = windowMinutes * 60 * 1000;

  // Include trains departing from "now" up to windowMinutes in the future.
  // Trains that have already departed (effectiveDeparture < now) are excluded.
  return effectiveDepartureMs >= nowMs && effectiveDepartureMs <= nowMs + windowMs;
}
