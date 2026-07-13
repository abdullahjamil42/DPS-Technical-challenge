import styles from './DepartureCard.module.css';

/**
 * DepartureCard — renders a single train departure row.
 *
 * Displays: time, delay badge, train number, destination,
 * platform, occupancy, and cancelled state.
 *
 * @param {{ departure: object }} props
 */
export function DepartureCard({ departure }) {
  const {
    trainNumber,
    destination,
    scheduledDepartureTime,
    delayMinutes,
    platform,
    isCancelled,
    occupancy,
  } = departure;

  const delayClass =
    delayMinutes === 0
      ? styles['delayBadge--onTime']
      : delayMinutes <= 5
      ? styles['delayBadge--delayed']
      : styles['delayBadge--veryDelayed'];

  const occupancyClass = styles[`occupancy--${occupancy?.toLowerCase() ?? 'unknown'}`] ?? styles['occupancy--unknown'];

  const occupancyDots = {
    low:     '● ○ ○',
    medium:  '● ● ○',
    high:    '● ● ●',
    unknown: '○ ○ ○',
  };

  return (
    <article
      className={`${styles.card} ${isCancelled ? styles['card--cancelled'] : ''}`}
      aria-label={`${trainNumber} to ${destination}, departing at ${scheduledDepartureTime}${isCancelled ? ', cancelled' : ''}`}
    >
      {/* Time & Delay */}
      <div className={styles.timeBlock}>
        <time className={styles.time} dateTime={scheduledDepartureTime}>
          {scheduledDepartureTime}
        </time>
        <div>
          {isCancelled ? (
            <span className={`${styles.delayBadge} ${styles['delayBadge--veryDelayed']}`}>
              ✕
            </span>
          ) : (
            <span className={`${styles.delayBadge} ${delayClass}`}>
              {delayMinutes === 0 ? 'On time' : `+${delayMinutes}′`}
            </span>
          )}
        </div>
      </div>

      {/* Train info */}
      <div className={styles.info}>
        <div className={styles.trainNumber}>{trainNumber}</div>
        <div className={styles.destination} title={destination}>
          {destination}
        </div>
        {isCancelled && (
          <div className={styles.cancelledLabel}>
            <span aria-hidden="true">✕</span>
            Cancelled
          </div>
        )}
      </div>

      {/* Platform & Occupancy */}
      <div className={styles.meta}>
        {platform && (
          <div className={styles.platform} aria-label={`Platform ${platform}`}>
            <span className={styles.platformLabel}>Plt</span>
            <span className={styles.platformValue}>{platform}</span>
          </div>
        )}
        {occupancy && occupancy !== 'unknown' && (
          <div
            className={`${styles.occupancy} ${occupancyClass}`}
            aria-label={`Occupancy: ${occupancy}`}
            title={`Occupancy: ${occupancy}`}
          >
            <span aria-hidden="true">{occupancyDots[occupancy.toLowerCase()] ?? occupancyDots.unknown}</span>
          </div>
        )}
      </div>
    </article>
  );
}
