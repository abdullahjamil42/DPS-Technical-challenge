# AI Usage Report

## Tools Used

- **Lovable** (Claude-based agent) — Used for the initial high-fidelity scaffold of the TanStack Start frontend client and the styling framework (`src/styles.css`).
- **Antigravity** (Google DeepMind pair programming assistant) — Used to implement the Express 5.0 backend architecture (Zod schemas, node-cache layers, routing, error handlers), write the entire Vitest suite (76 unit/integration tests), handle frontend/backend integration endpoints, implement production resiliency features (timeouts, retries, graceful shutdown, CORS allowlist, request logging), and resolve monorepo dependency hoisting.
- Occasional targeted prompts for phrasing (README wording, badge copy).

## What I asked it to do

1. Set up the project shell (TanStack Start, Tailwind v4, dark theme with an SNCB-inspired palette).
2. Implement the frontend search UI components, fuzzy substring matching list blocks, and responsive CSS variables.
3. Draft the initial README and this file.
4. Implement a robust Express 5.0 backend with service layers, Helmet/CORS security, rate-limiting, and dual node-cache layers.
5. Create a test suite with 76 passing unit and integration tests using Vitest (covering time utilities, matching logic, and route response contracts).
6. Wire the custom TanStack client with the Express backend APIs via a Vite proxy.
7. Implement frontend fetch timeouts, relative "in X min" countdowns, manual/automatic refreshes, clear-input triggers, and suggestion chips.
8. Set up Docker multi-stage compose orchestration with built-in backend health checks.

## What I accepted as-is

- The Tailwind design tokens in `src/styles.css` (navy/yellow palette, JetBrains Mono + Inter pairing). Matches the "Belgian rail" brief cleanly.
- The overall React component decomposition (`SearchBar`, `StationCard`, `DepartureRow`, `StatusBadge`).
- The debounce hook.

## What I rewrote / adjusted

- **The Matching Strategy:** Changed initial pure-fuzzy matching to substring-first + fuzzy fallback so the primary spec (`"Bru"`, `"Aac"`) behaves predictably and fuzzy is the bonus.
- **The Error Contract:** Unified backend error shapes across both `/departures` and `/api/departures` using `createApiError` to return consistent `SCREAMING_SNAKE_CASE` codes and clean sanitised messages that do not leak internal HTTP status codes to clients.
- **Failsafe Upstream Timeouts & Retries:** Added a `fetchWithRetry` helper that performs a single retry on transient HTTP status failures (like 429 rate limits or 5xx server errors). Network timeouts are aborted in 4 seconds and skipped from retry to prevent compounding delays, while the frontend timeout is set to 15 seconds to ensure the client never hangs.
- **Per-station Error Isolation:** Configured parallel fetches via `Promise.all` with individual `try/catch` wrappers. If a single station's liveboard request rejects or times out, it is isolated and returns an error field on that station block, rather than failing the entire request.
- Added a **`stationCount` fanout cap** and process-lifetime caching for the station index.
- Added a **CORS allowlist** instead of a wild card to restrict browser origins securely.
- Attached **`X-Request-ID` UUID headers** to request tracing and backend logs.
- Added **process signal handlers** for `SIGINT` (Ctrl+C in dev) and `SIGTERM` (Docker stops) to execute graceful shutdowns of the HTTP server.

## What I rejected

- Generating a big TypeScript type from the iRail OpenAPI. Overkill — the handler only touches a handful of fields, and mapping to a small DTO gives a stable contract regardless of upstream drift.
- Adding SWR/React Query on the client. One debounced fetch with abort is sufficient; extra caching would fight the "always fresh" intent.
- Server-side rendering the initial results. The page is inherently interactive (user types → fetch) so SSR buys nothing here.

## Prompts / Plan

The working plan I used with the agent:

> Build a TanStack Start app. Add `GET /api/departures?q=`: return 400 if `q.length < 3`; otherwise match iRail stations by substring (fall back to fuzzy via fuse.js), fetch each match's liveboard, keep departures in the next 15 minutes, and return `{ query, now, windowMinutes, stations: [{ station: { id, name, matchType }, departures: [...] }] }`. Cap the fanout at 8. Cache the station index. Isolate per-station errors. Then build a single dark-themed React page with a debounced search, grouped results, delay / cancelled badges, and empty/error states. Palette: SNCB navy + yellow, monospace display font.

No public chat links — sessions were inside private workspaces.
