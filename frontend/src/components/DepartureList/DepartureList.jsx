import styles from './DepartureList.module.css';
import { StationGroup } from '../StationGroup/StationGroup.jsx';

/**
 * Skeleton loader shown while data is fetching.
 * Renders two simulated station groups with shimmer cards.
 */
function SkeletonLoader() {
  return (
    <div className={styles.skeletonWrapper} aria-busy="true" aria-label="Loading departures">
      {[0, 1].map((i) => (
        <div key={i} className={styles.skeletonGroup}>
          <div className={styles.skeletonHeader} />
          <div className={styles.skeletonCard} />
          <div className={styles.skeletonCard} />
          <div className={styles.skeletonCard} />
        </div>
      ))}
    </div>
  );
}

/**
 * Empty state shown when the query returns no results.
 */
function EmptyState({ query }) {
  return (
    <div className={styles.stateContainer} role="status">
      <div className={styles.stateEmoji}>🚂</div>
      <h3 className={styles.stateTitle}>No departures found</h3>
      <p className={styles.stateMessage}>
        No trains are departing within the next 15 minutes from stations matching{' '}
        <strong>&ldquo;{query}&rdquo;</strong>. Try a different station name.
      </p>
    </div>
  );
}

/**
 * Error state shown when the API call fails.
 */
function ErrorState({ error, onRetry }) {
  const isBackendDown = error?.code === 'IRAIL_UNAVAILABLE';

  return (
    <div className={styles.stateContainer} role="alert">
      <div className={styles.stateEmoji}>{isBackendDown ? '📡' : '⚠️'}</div>
      <h3 className={styles.stateTitle}>
        {isBackendDown ? 'Connection issue' : 'Something went wrong'}
      </h3>
      <p className={styles.stateMessage}>
        {isBackendDown
          ? 'The iRail API is temporarily unavailable. This happens occasionally — please try again in a moment.'
          : error?.message ?? 'An unexpected error occurred. Please try again.'}
      </p>
      <button className={styles.retryButton} onClick={onRetry} type="button">
        Try again
      </button>
    </div>
  );
}

/**
 * DepartureList — orchestrates loading, error, empty, and data states.
 *
 * Renders station groups from the API response.
 *
 * @param {{
 *   query: string,
 *   isLoading: boolean,
 *   isFetching: boolean,
 *   isError: boolean,
 *   error: Error|null,
 *   data: object|undefined,
 *   refetch: () => void
 * }} props
 */
export function DepartureList({ query, isLoading, isError, error, data, refetch }) {
  // Loading: first fetch, no previous data
  if (isLoading && !data) {
    return <SkeletonLoader />;
  }

  if (isError) {
    return <ErrorState error={error} onRetry={refetch} />;
  }

  if (!data || data.stations.length === 0) {
    return <EmptyState query={query} />;
  }

  const { stations, fetchedAt, stationCount } = data;
  const fetchedAtFormatted = new Date(fetchedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className={styles.container}>
      {/* Result metadata bar */}
      <div className={styles.metaBar} role="status" aria-live="polite">
        <div className={styles.metaBarLeft}>
          <span>Results for</span>
          <span className={styles.metaBarQuery}>&ldquo;{query}&rdquo;</span>
          <span>— {stationCount} {stationCount === 1 ? 'station' : 'stations'}</span>
        </div>
        <div className={styles.metaBarRight}>
          Updated {fetchedAtFormatted}
        </div>
      </div>

      {/* Station groups */}
      {stations.map((station) => (
        <StationGroup key={station.stationId} station={station} />
      ))}
    </div>
  );
}
