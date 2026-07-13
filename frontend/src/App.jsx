import { useState, useCallback, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { SearchBar } from './components/SearchBar/SearchBar.jsx';
import { DepartureList } from './components/DepartureList/DepartureList.jsx';
import { useDepartures } from './hooks/useDepartures.js';
import styles from './App.module.css';

/** Read the ?q= param from the current URL (empty string if absent). */
function getQueryFromUrl() {
  return new URLSearchParams(window.location.search).get('q') ?? '';
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true, // Refresh data when user tabs back to the app
    },
  },
});

/**
 * Inner app — wrapped by QueryClientProvider.
 * Keeps the query state lifted here so SearchBar and DepartureList
 * share the same query value without prop drilling through a context.
 */
function TrainTracker() {
  // Initialise from URL so that ?q=Bru loads results immediately on page open.
  const [query, setQuery] = useState(getQueryFromUrl);
  const { isLoading, isFetching, isError, error, data, refetch } = useDepartures(query);

  const handleSearch = useCallback((q) => {
    setQuery(q);

    // Reflect the query in the URL so the search is shareable and the
    // browser back-button restores the previous search.
    const url = new URL(window.location.href);
    if (q) {
      url.searchParams.set('q', q);
    } else {
      url.searchParams.delete('q');
    }
    window.history.pushState({}, '', url);
  }, []);

  // Keep query in sync when the user navigates back/forward.
  useEffect(() => {
    const onPopState = () => setQuery(getQueryFromUrl());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const hasActiveQuery = query.length >= 3;

  return (
    <div className={styles.app}>
      {/* ── Header ─────────────────────────────────────────── */}
      <header className={styles.header} role="banner">
        <div className={styles.header__inner}>
          <a href="/" className={styles.header__logo} aria-label="Lagovia Train Tracker home">
            <div className={styles.header__icon} aria-hidden="true">🚆</div>
            <div>
              <div className={styles.header__title}>Lagovia</div>
              <div className={styles.header__subtitle}>Train Departure Tracker</div>
            </div>
          </a>

          <div className={styles['header__live-badge']} aria-label="Live departure data">
            <span className={styles['header__live-dot']} aria-hidden="true" />
            Live
          </div>
        </div>
      </header>

      {/* ── Main Content ────────────────────────────────────── */}
      <main className={styles.main} id="main-content">
        {/* Hero — only shown when no active search */}
        {!hasActiveQuery && (
          <section className={styles.hero} aria-label="Welcome">
            <p className={styles.hero__tagline}>Real-time departures</p>
            <h1 className={styles.hero__heading}>
              Where is your <span>train</span> going?
            </h1>
            <p className={styles.hero__description}>
              Search any Belgian station by name. See departures leaving in the next 15 minutes —
              with live delay and platform information.
            </p>
          </section>
        )}

        {/* Search */}
        <SearchBar onSearch={handleSearch} initialValue={query} />

        {/* Results */}
        {hasActiveQuery && (
          <DepartureList
            query={query}
            isLoading={isLoading}
            isFetching={isFetching}
            isError={isError}
            error={error}
            data={data}
            refetch={refetch}
          />
        )}
      </main>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer className={styles.footer} role="contentinfo">
        Powered by the{' '}
        <a href="https://docs.irail.be/" target="_blank" rel="noopener noreferrer">
          iRail API
        </a>{' '}
        · Built for{' '}
        <a href="https://digitalproductschool.io/" target="_blank" rel="noopener noreferrer">
          Digital Product School Munich
        </a>
      </footer>

      {/* React Query devtools — only in development */}
      <ReactQueryDevtools initialIsOpen={false} />
    </div>
  );
}

/**
 * App root — provides the React Query client context.
 */
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TrainTracker />
    </QueryClientProvider>
  );
}
