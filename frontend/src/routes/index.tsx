import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';

const searchSchema = z.object({
  q: z.string().optional().catch(''),
});

export const Route = createFileRoute('/')({
  validateSearch: (search) => searchSchema.parse(search),
  component: Index,
});

// ---- Types mirroring /api/departures ----
interface Departure {
  trainNumber: string;
  destination: string;
  scheduledTime: string;
  delayMinutes: number;
  cancelled: boolean;
  platform?: string;
}
interface StationBlock {
  station: { id: string; name: string; matchType: 'substring' | 'fuzzy' };
  departures: Departure[];
  error?: string;
}
interface DeparturesResponse {
  query: string;
  now: string;
  windowMinutes: number;
  stationCount: number;
  stations: StationBlock[];
}
interface ApiError {
  error: string;
  message: string;
  minLength?: number;
}

type FetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: DeparturesResponse; isRefreshing?: boolean }
  | { status: 'error'; message: string; kind: 'input' | 'network' };

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function Index() {
  const { q = '' } = Route.useSearch();
  const [query, setQuery] = useState(q);
  const navigate = Route.useNavigate();
  const debounced = useDebouncedValue(query.trim(), 300);
  const [state, setState] = useState<FetchState>({ status: 'idle' });
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  // Sync debounced search value back to the URL search parameter
  useEffect(() => {
    navigate({
      search: (old) => ({ ...old, q: debounced || undefined }),
      replace: true,
    });
  }, [debounced, navigate]);

  // Sync URL search parameter changes back to local input state (e.g. browser back/forward buttons)
  useEffect(() => {
    setQuery(q);
  }, [q]);

  // Set up an auto-refresh timer to increment refreshTrigger every 60s when there is a query
  useEffect(() => {
    if (q.trim().length < 3) return;
    const t = setInterval(() => {
      setRefreshTrigger((prev) => prev + 1);
    }, 60000);
    return () => clearInterval(t);
  }, [q]);

  // Fetch departure data whenever the URL parameter 'q' changes or a refresh is triggered
  useEffect(() => {
    const activeQuery = q.trim();
    if (activeQuery.length === 0) {
      setState({ status: 'idle' });
      return;
    }
    if (activeQuery.length < 3) {
      setState({
        status: 'error',
        kind: 'input',
        message: 'Type at least 3 characters to search.',
      });
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Use background refresh if results are already loaded to avoid layout jumps
    setState((prev) =>
      prev.status === 'success'
        ? { ...prev, isRefreshing: true }
        : { status: 'loading' }
    );

    fetch(`/api/departures?q=${encodeURIComponent(activeQuery)}`, { signal: ctrl.signal })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) {
          const err = body as ApiError;
          setState({
            status: 'error',
            kind: err.error === 'query_too_short' ? 'input' : 'network',
            message: err.message ?? 'Something went wrong.',
          });
          return;
        }
        setState({ status: 'success', data: body as DeparturesResponse, isRefreshing: false });
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setState({
          status: 'error',
          kind: 'network',
          message: 'Could not reach the tracker. Check your connection and retry.',
        });
      });

    return () => ctrl.abort();
  }, [q, refreshTrigger]);

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-5xl px-4 pb-24 pt-8 sm:pt-12">
        <SearchBar query={query} onChange={setQuery} />
        <ResultsArea state={state} query={debounced} />
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="border-b border-border/60 bg-background/70 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-primary font-display text-lg font-bold text-primary-foreground">
            L
          </div>
          <div className="leading-tight">
            <p className="font-display text-sm uppercase tracking-widest text-primary">
              Lagovia Rail
            </p>
            <p className="text-xs text-muted-foreground">Live departure tracker · data via iRail</p>
          </div>
        </div>
        <a
          href="/api/departures?q=Bru"
          className="hidden text-xs uppercase tracking-widest text-muted-foreground hover:text-primary sm:inline"
        >
          API ↗
        </a>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
      Trains are always late in Lagovia. Data © iRail / NMBS-SNCB.
    </footer>
  );
}

function SearchBar({ query, onChange }: { query: string; onChange: (v: string) => void }) {
  return (
    <section className="mb-8">
      <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-foreground sm:text-4xl">
        Next <span className="text-primary">15 minutes</span> of departures
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Type part of any station name — "Bru", "Aac", or even "Antverpen" (fuzzy match). We'll show
        every upcoming departure from every matching station.
      </p>
      <div className="mt-6 flex items-center gap-2 rounded-sm border border-border bg-card px-4 py-3 shadow-lg focus-within:border-primary">
        <SearchIcon className="h-5 w-5 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search station name…"
          className="w-full bg-transparent font-display text-lg tracking-wide text-foreground outline-none placeholder:text-muted-foreground/60"
          autoFocus
          spellCheck={false}
        />
      </div>
    </section>
  );
}

function ResultsArea({ state, query }: { state: FetchState; query: string }) {
  if (state.status === 'idle') {
    return (
      <EmptyHint>
        Start typing to see departures. Try <Kbd>Bru</Kbd>, <Kbd>Gent</Kbd> or <Kbd>Aac</Kbd>.
      </EmptyHint>
    );
  }
  if (state.status === 'loading') return <LoadingBoard />;
  if (state.status === 'error') {
    return (
      <div
        role="alert"
        className={`rounded-sm border px-4 py-3 text-sm ${
          state.kind === 'input'
            ? 'border-warning/60 bg-warning/10 text-warning'
            : 'border-destructive/60 bg-destructive/10 text-destructive-foreground'
        }`}
      >
        {state.message}
      </div>
    );
  }

  const { data } = state;
  const isRefreshing = state.status === 'success' && state.isRefreshing;

  if (data.stations.length === 0) {
    return (
      <EmptyHint>
        No stations matched <Kbd>{query}</Kbd>. Try a different substring.
      </EmptyHint>
    );
  }

  const totalDepartures = data.stations.reduce((n, s) => n + s.departures.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs uppercase tracking-widest text-muted-foreground">
        <span className="flex items-center gap-2">
          {data.stationCount} station{data.stationCount === 1 ? '' : 's'} · {totalDepartures}{' '}
          departure{totalDepartures === 1 ? '' : 's'} in the next {data.windowMinutes} min
          {isRefreshing && (
            <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          )}
        </span>
        <span className="font-display text-primary">
          {isRefreshing
            ? 'Refreshing…'
            : `Updated at ${new Date(data.now).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}`}
        </span>
      </div>
      {data.stations.map((block) => (
        <StationCard key={block.station.id} block={block} />
      ))}
    </div>
  );
}

function StationCard({ block }: { block: StationBlock }) {
  return (
    <section className="overflow-hidden rounded-sm border border-border bg-card shadow-lg">
      <header className="flex items-center justify-between border-b border-border/70 bg-secondary/40 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 rounded-full bg-primary" />
          <h2 className="font-display text-lg font-bold uppercase tracking-wide">
            {block.station.name}
          </h2>
          {block.station.matchType === 'fuzzy' && (
            <span className="rounded-sm border border-primary/40 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-primary">
              fuzzy
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{block.departures.length} upcoming</span>
      </header>

      {block.error ? (
        <p className="px-4 py-4 text-sm text-destructive-foreground">
          Couldn't load this station: {block.error}
        </p>
      ) : block.departures.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          Nothing scheduled in the next 15 minutes.
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {block.departures.map((d, i) => (
            <DepartureRow key={`${d.trainNumber}-${d.scheduledTime}-${i}`} d={d} />
          ))}
        </ul>
      )}
    </section>
  );
}

function DepartureRow({ d }: { d: Departure }) {
  const scheduled = useMemo(
    () =>
      new Date(d.scheduledTime).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    [d.scheduledTime]
  );

  return (
    <li className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-3 sm:grid-cols-[80px_100px_1fr_auto]">
      <span className="font-display text-xl font-bold text-primary tabular-nums">{scheduled}</span>
      <span className="font-display text-sm uppercase tracking-wider text-muted-foreground">
        {d.trainNumber}
      </span>
      <span
        className={`text-sm ${d.cancelled ? 'text-muted-foreground line-through' : 'text-foreground'}`}
      >
        → {d.destination}
        {d.platform && (
          <span className="ml-2 text-xs uppercase text-muted-foreground">pl. {d.platform}</span>
        )}
      </span>
      <StatusBadge delay={d.delayMinutes} cancelled={d.cancelled} />
    </li>
  );
}

function StatusBadge({ delay, cancelled }: { delay: number; cancelled: boolean }) {
  if (cancelled) {
    return (
      <span className="rounded-sm bg-destructive px-2 py-1 font-display text-xs font-bold uppercase tracking-widest text-destructive-foreground">
        Cancelled
      </span>
    );
  }
  if (delay === 0) {
    return (
      <span className="font-display text-xs uppercase tracking-widest text-success">On time</span>
    );
  }
  return (
    <span className="rounded-sm bg-warning/20 px-2 py-1 font-display text-xs font-bold uppercase tracking-widest text-warning">
      +{delay} min
    </span>
  );
}

function LoadingBoard() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-sm border border-border/60 bg-card/50" />
      ))}
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-sm border border-dashed border-border/60 bg-card/30 px-6 py-16 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mx-1 rounded-sm border border-border bg-secondary px-1.5 py-0.5 font-display text-xs text-foreground">
      {children}
    </kbd>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
