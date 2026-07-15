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
  occupancy?: string;
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
  truncated: boolean;
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
  | { status: 'error'; message: string; kind: 'input' | 'network' | 'rate-limit' };

const SUGGESTED_STATIONS = ['Brussel', 'Gent', 'Antwerpen', 'Liège', 'Brugge'];

// E-16: Frontend fetch timeout — 15 seconds
const FETCH_TIMEOUT_MS = 15_000;

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

  // Sync URL search parameter changes back to local input state (e.g. browser back/forward)
  useEffect(() => {
    setQuery(q);
  }, [q]);

  // E-21: Only auto-refresh when query is valid (≥3 chars) and state is not an input error
  useEffect(() => {
    if (q.trim().length < 3) return;
    if (state.status === 'error' && state.kind === 'input') return;

    const t = setInterval(() => {
      setRefreshTrigger((prev) => prev + 1);
    }, 60_000);
    return () => clearInterval(t);
  }, [q, state.status]);

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

    // E-16: Apply a hard 10-second fetch timeout independent of backend
    const timeoutId = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

    setState((prev) =>
      prev.status === 'success'
        ? { ...prev, isRefreshing: true }
        : { status: 'loading' }
    );

    fetch(`/api/departures?q=${encodeURIComponent(activeQuery)}`, { signal: ctrl.signal })
      .then(async (res) => {
        clearTimeout(timeoutId);
        const body = await res.json();
        if (!res.ok) {
          const err = body as ApiError;
          // E-17: Distinguish 429 rate-limit from other network errors
          if (res.status === 429) {
            setState({ status: 'error', kind: 'rate-limit', message: 'Too many requests — please wait a moment before searching again.' });
            return;
          }
          setState({
            status: 'error',
            kind: err.error === 'QUERY_TOO_SHORT' || err.error === 'MISSING_QUERY' ? 'input' : 'network',
            message: err.message ?? 'Something went wrong.',
          });
          return;
        }
        setState({ status: 'success', data: body as DeparturesResponse, isRefreshing: false });
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          // E-16: Distinguish frontend timeout from user-cancelled request
          if (!ctrl.signal.aborted || refreshTrigger >= 0) {
            setState({
              status: 'error',
              kind: 'network',
              message: 'Request timed out. The server is taking too long — please try again.',
            });
          }
          return;
        }
        setState({
          status: 'error',
          kind: 'network',
          message: 'Could not reach the tracker. Check your connection and retry.',
        });
      });

    return () => {
      clearTimeout(timeoutId);
      ctrl.abort();
    };
  }, [q, refreshTrigger]);

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-5xl px-4 pb-24 pt-8 sm:pt-12">
        <SearchBar query={query} onChange={setQuery} />
        <ResultsArea
          state={state}
          query={debounced}
          onRefresh={() => setRefreshTrigger((p) => p + 1)}
        />
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

// F-3: Clear search button inside the search bar
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
        <SearchIcon className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search station name…"
          className="w-full bg-transparent font-display text-lg tracking-wide text-foreground outline-none placeholder:text-muted-foreground/60"
          autoFocus
          spellCheck={false}
          maxLength={100}
          aria-label="Search station"
        />
        {/* F-3: Clear button — only shown when there's something to clear */}
        {query.length > 0 && (
          <button
            onClick={() => onChange('')}
            aria-label="Clear search"
            className="flex-shrink-0 rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <XIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </section>
  );
}

function ResultsArea({
  state,
  query,
  onRefresh,
}: {
  state: FetchState;
  query: string;
  onRefresh: () => void;
}) {
  if (state.status === 'idle') {
    return (
      <>
        <EmptyHint>
          Start typing to see departures. Try <Kbd>Bru</Kbd>, <Kbd>Gent</Kbd> or <Kbd>Aac</Kbd>.
        </EmptyHint>
        {/* F-4: Suggestion chips on idle */}
        <SuggestionChips query={query} />
      </>
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
            : state.kind === 'rate-limit'
              ? 'border-orange-500/60 bg-orange-500/10 text-orange-400'
              : 'border-destructive/60 bg-destructive/10 text-destructive-foreground'
        }`}
      >
        {state.kind === 'rate-limit' && <span className="mr-2">⏱</span>}
        {state.message}
      </div>
    );
  }

  const { data } = state;
  const isRefreshing = state.status === 'success' && state.isRefreshing;

  if (data.stations.length === 0) {
    return (
      <>
        <EmptyHint>
          No stations matched <Kbd>{query}</Kbd>. Try a different substring.
        </EmptyHint>
        {/* F-4: Suggestion chips on empty result */}
        <SuggestionChips query={query} />
      </>
    );
  }

  const totalDepartures = data.stations.reduce((n, s) => n + s.departures.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs uppercase tracking-widest text-muted-foreground">
        <span className="flex items-center gap-2">
          {data.stationCount} station{data.stationCount === 1 ? '' : 's'} · {totalDepartures}{' '}
          departure{totalDepartures === 1 ? '' : 's'} in the next {data.windowMinutes} min
          {data.truncated && (
            <span className="rounded-sm border border-warning/50 bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning">
              + more
            </span>
          )}
          {isRefreshing && (
            <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          )}
        </span>
        <div className="flex items-center gap-3">
          <span className="font-display text-primary">
            {isRefreshing
              ? 'Refreshing…'
              : `Updated ${new Date(data.now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
          </span>
          {/* F-1: Manual refresh button */}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label="Refresh departures"
            className="flex items-center gap-1.5 rounded-sm border border-border px-2 py-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-40"
          >
            <RefreshIcon className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>
      {data.stations.map((block) => (
        <StationCard key={block.station.id} block={block} windowMinutes={data.windowMinutes} />
      ))}
    </div>
  );
}

// F-4: Suggestion chips for idle/empty-result states — navigate via href link
function SuggestionChips({ query }: { query: string }) {
  // Don't show chips if the query already matches one of the suggestions
  const chips = SUGGESTED_STATIONS.filter(
    (s) => !query || !s.toLowerCase().includes(query.toLowerCase())
  );
  if (chips.length === 0) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-widest text-muted-foreground">Try:</span>
      {chips.map((s) => (
        <a
          key={s}
          href={`/?q=${encodeURIComponent(s)}`}
          className="rounded-sm border border-border bg-secondary px-3 py-1 font-display text-xs uppercase tracking-widest text-foreground transition-colors hover:border-primary hover:text-primary"
        >
          {s}
        </a>
      ))}
    </div>
  );
}

function StationCard({ block, windowMinutes }: { block: StationBlock; windowMinutes: number }) {
  // F-9: Count cancelled departures for the badge
  const cancelledCount = block.departures.filter((d) => d.cancelled).length;

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
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {/* F-9: Cancelled badge */}
          {cancelledCount > 0 && (
            <span className="rounded-sm bg-destructive/20 px-1.5 py-0.5 font-display text-[10px] uppercase tracking-widest text-destructive-foreground">
              {cancelledCount} cancelled
            </span>
          )}
          <span>{block.departures.length} upcoming</span>
        </div>
      </header>

      {block.error ? (
        <p className="px-4 py-4 text-sm text-destructive-foreground">
          ⚠ Couldn't load this station: {block.error}
        </p>
      ) : block.departures.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          Nothing scheduled in the next {windowMinutes} minutes.
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

  // F-2: "in X min" countdown — relative time is far more useful at a glance
  const minutesUntil = useMemo(() => {
    const effective = new Date(d.scheduledTime).getTime() + d.delayMinutes * 60_000;
    const diff = Math.round((effective - Date.now()) / 60_000);
    if (diff <= 0) return 'now';
    if (diff === 1) return 'in 1 min';
    return `in ${diff} min`;
  }, [d.scheduledTime, d.delayMinutes]);

  // F-6: Occupancy icon
  const occupancyIcon =
    d.occupancy === 'high' ? '🔴' : d.occupancy === 'medium' ? '🟡' : d.occupancy === 'low' ? '🟢' : null;

  return (
    <li className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-3 sm:grid-cols-[80px_80px_100px_1fr_auto]">
      <span className="font-display text-xl font-bold text-primary tabular-nums">{scheduled}</span>
      {/* F-2: Countdown */}
      <span className="hidden font-display text-xs tabular-nums text-muted-foreground sm:block">
        {minutesUntil}
      </span>
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
        {/* F-6: Occupancy icon inline */}
        {occupancyIcon && (
          <span className="ml-2 text-xs" title={`Occupancy: ${d.occupancy}`}>{occupancyIcon}</span>
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

// F-3: X icon for clear button
function XIcon({ className }: { className?: string }) {
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
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

// F-1: Refresh icon
function RefreshIcon({ className }: { className?: string }) {
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
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}
