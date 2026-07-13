import styles from './StationGroup.module.css';
import { DepartureCard } from '../DepartureCard/DepartureCard.jsx';

/**
 * StationGroup — renders all departures grouped under a single station header.
 *
 * @param {{ station: { stationName: string, stationId: string, departures: Array } }} props
 */
export function StationGroup({ station }) {
  const { stationName, departures } = station;
  const count = departures.length;

  return (
    <section className={styles.group} aria-labelledby={`station-${stationName}`}>
      <header className={styles.header}>
        <div className={styles.stationIcon} aria-hidden="true">🚉</div>
        <h2 id={`station-${stationName}`} className={styles.stationName}>
          {stationName}
        </h2>
        <span className={styles.departureCount} aria-label={`${count} departures`}>
          {count} {count === 1 ? 'departure' : 'departures'}
        </span>
      </header>

      <ul className={styles.list} aria-label={`Departures from ${stationName}`}>
        {departures.map((departure) => (
          <li key={departure.id}>
            <DepartureCard departure={departure} />
          </li>
        ))}
      </ul>
    </section>
  );
}
