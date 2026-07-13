# AI usage report

## Tools used

- **Lovable** (Claude-based agent) — used for the initial scaffold of the
  TanStack Start project, the design system in `src/styles.css`, and the
  first pass of the React UI.
- Occasional targeted prompts for phrasing (README wording, badge copy).

## What I asked it to do

1. Set up the project shell (TanStack Start, Tailwind v4, dark theme with an
   SNCB-inspired palette).
2. Implement `GET /api/departures` and the search UI in one pass, given the
   iRail docs and the challenge brief.
3. Draft the README and this file.

## What I accepted as-is

- The Tailwind design tokens in `src/styles.css` (navy/yellow palette,
  JetBrains Mono + Inter pairing). Matches the "Belgian rail" brief cleanly.
- The overall React component decomposition (`SearchBar`, `StationCard`,
  `DepartureRow`, `StatusBadge`).
- The debounce hook.

## What I rewrote / adjusted

- The **matching strategy**. First draft was pure fuzzy via `fuse.js`; I
  changed it to substring-first + fuzzy fallback so the primary spec
  (`"Bru"`, `"Aac"`) behaves predictably and fuzzy is the bonus.
- The **error contract**. First draft returned `{ error: string }` for
  everything; I added a stable `error` code (`query_too_short`,
  `upstream_failed`) and a `message` field so clients can branch on the
  code, not the copy.
- **Per-station error isolation** — the first draft used
  `Promise.all` and would fail the whole response if any single liveboard
  request rejected. Switched to per-station `try/catch` returning an
  `error` field on the offending block.
- Added a **`stationCount` fanout cap** and process-lifetime caching for
  the station index. Neither was in the first draft.
- The `.dark` block from the shadcn template is dead code in this project
  (the whole app is dark); left in place because removing it is out of
  scope for the challenge but noted here.

## What I rejected

- Generating a big TypeScript type from the iRail OpenAPI. Overkill — the
  handler only touches a handful of fields, and mapping to a small DTO
  gives me a stable contract regardless of upstream drift.
- Adding SWR/React Query on the client. One debounced fetch with abort is
  sufficient; extra caching would fight the "always fresh" intent.
- Server-side rendering the initial results. The page is inherently
  interactive (user types → fetch) so SSR buys nothing here.

## Prompts / plan

The working plan I used with the agent, roughly:

> Build a TanStack Start app. Add `GET /api/departures?q=`: return 400 if
> `q.length < 3`; otherwise match iRail stations by substring (fall back
> to fuzzy via fuse.js), fetch each match's liveboard, keep departures in
> the next 15 minutes, and return `{ query, now, windowMinutes, stations:
> [{ station: { id, name, matchType }, departures: [...] }] }`. Cap the
> fanout at 8. Cache the station index. Isolate per-station errors. Then
> build a single dark-themed React page with a debounced search, grouped
> results, delay / cancelled badges, and empty/error states. Palette:
> SNCB navy + yellow, monospace display font.

No public chat links — sessions were inside Lovable's private workspace.
