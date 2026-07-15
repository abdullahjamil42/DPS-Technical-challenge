# Lagovia Train Tracker 🚆

> **DPS Munich Software Engineer Challenge Submission**

A full-stack application that lets users search any Belgian railway station and see departures leaving in the **next 15 minutes** — with live delay, platform, and cancellation information.

Built with a deliberate emphasis on clean architecture, testability, and product-minded engineering.

---

## Tech Stack

| Layer      | Technology                | Why                                                         |
| ---------- | ------------------------- | ----------------------------------------------------------- |
| Backend    | Node.js 20 + Express 5    | DPS preferred stack; excellent async I/O                    |
| Validation | Zod                       | Schema-first, type-safe query validation                    |
| Caching    | node-cache                | Avoids hammering iRail; stations cached 1hr, liveboards 30s |
| Frontend   | TanStack Start (React 19) | Modern React meta-framework built on TanStack Router        |
| Styling    | Tailwind CSS v4           | Utility-first styling for high-fidelity dark-mode layouts   |
| Testing    | Vitest + Supertest        | Fast, ESM-native test runner                                |

---

## Local Setup

**Prerequisites:** Node.js ≥ 20

```bash
# 1. Clone the repository
git clone https://github.com/abdullahjamil42/DPS-Technical-challenge.git
cd DPS-Technical-challenge

# 2. Install all workspace dependencies
npm install

# 3. Start backend + frontend concurrently
npm run dev
```

- **Backend API:** http://localhost:3001
- **Frontend UI:** http://localhost:3000 (or http://localhost:8080 depending on port availability)
- **Health check:** http://localhost:3001/health

### Docker Setup (Recommended)

Alternatively, you can run the full-stack application completely containerized using Docker Compose:

```bash
# Build and start frontend & backend services concurrently
docker compose up --build
```

- **Frontend UI:** http://localhost:3000
- **Backend API:** http://localhost:3001
- **Health check:** http://localhost:3001/health

### Running Tests

```bash
# All workspaces
npm test

# Backend only
cd backend && npm test

# Frontend only
cd frontend && npm test
```

---

## API Documentation

### `GET /departures?q=<query>`

Returns upcoming departures for all stations matching the search query.

**Validation:** Query must be ≥ 3 characters.

**Example request:**

```
GET /departures?q=Bru
```

**Success response (200):**

```json
{
  "query": "Bru",
  "fetchedAt": "2024-06-01T14:00:00.000Z",
  "stationCount": 3,
  "stations": [
    {
      "stationName": "Brussels-Central",
      "stationId": "BE.NMBS.008813003",
      "departures": [
        {
          "id": "http://irail.be/connections/...",
          "trainNumber": "IC532",
          "destination": "Antwerp-Central",
          "scheduledDepartureTime": "14:05",
          "delayMinutes": 3,
          "platform": "4",
          "isCancelled": false,
          "occupancy": "low"
        }
      ]
    }
  ]
}
```

**Error response (400) — query too short:**

```json
{
  "error": "QUERY_TOO_SHORT",
  "message": "Query must be at least 3 characters long.",
  "minLength": 3,
  "received": 2
}
```

---

## How Searching Works (Fuzzy Search)

To make searching fast and spelling-tolerant, the app uses a **two-tier search strategy**:

1. **Exact Matches (Direct Substrings):** The system first searches all station names for a direct match containing your search text. For example, typing `"Bru"` instantly matches `"Brussels-Midi"` or `"Brugelette"`.
2. **Typos & Close Spelling Fallback (Fuzzy Search):** If there are fewer than 8 exact matches, the system automatically uses **`Fuse.js`** to look for close spelling variations. If you misspell Antwerpen as `"Antverpen"`, it detects the close match and shows `"Antwerpen-Centraal"`.
3. **Smart Tagging:** Any stations found via typo-matching are tagged with a yellow `[FUZZY]` badge in the UI so you know the app made an approximate guess.

---

## Architecture

```
DPS-Technical-challenge/
├── backend/                  # Node.js + Express API
│   └── src/
│       ├── app.js            # Express factory (testable)
│       ├── config.js         # All env & tuning constants
│       ├── routes/           # HTTP routes (departures & health)
│       ├── services/         # Business logic (station matching & caching)
│       ├── middleware/       # Error handler
│       └── utils/            # Time utilities
└── frontend/                 # TanStack Start SSR App
    └── src/
        ├── components/       # Custom components and layout cards
        ├── lib/              # Client helpers
        ├── routes/           # File-system router routes
        ├── server.ts         # SSR entry point
        └── start.ts          # Client mount entry point
```

### Key Design Decisions

**1. Service-layer separation.** Business logic (station matching, time filtering, normalization) is isolated in `departureService.js`. The route handler only handles HTTP concerns. This is the most important architectural decision — it makes unit testing trivial and future refactoring safe.

**2. Dual caching strategy.** The iRail station list (~600 stations) is cached for 1 hour; liveboards are cached for 30 seconds. This prevents API rate-limit errors while keeping departure data near-real-time.

**3. Parallel liveboard fetches.** If "Bru" matches 5 stations, we fetch all 5 liveboards concurrently with `Promise.all`. The alternative (sequential) would be 5× slower.

**4. Graceful degradation.** If a single station's liveboard fetch fails, it is omitted from the result rather than failing the entire request. The user still sees results for all other matched stations.

**5. Backend-side time filtering.** The 15-minute window filter lives on the server, not the client. This is a deliberate API design choice — clients should not be responsible for interpreting business rules.

**6. Debounced fetches with AbortControllers.** The client-side utilizes a robust debouncing mechanism paired with React `useEffect` cleanup abort signals to guarantee that rapid typing triggers only one request at a time and cancels outdated in-flight fetches immediately.

### Recent Enhancements

To raise the bar for production readiness, the codebase has been significantly improved:

- **Consolidated Route Logic:** Station matching (substring with Fuse.js fuzzy fallback), parallel liveboard fetching, error isolation, and departure filters were refactored from duplicate endpoint handlers into a single unified service layer in [departureService.js](file:///c:/Users/admin/Documents/GitHub/DPS-Technical-challenge/backend/src/services/departureService.js).
- **Bookmarkable Searches (URL Sync):** Synced React search query state with the URL query parameters `/?q=query` using TanStack Router search validation, enabling bookmarking, direct links loading, and full back/forward browser history integration.
- **Background Auto-Refresh (Every 60s):** Added a silent, background departures polling interval that updates boards every minute without clearing screens or causing layout skeletons to flicker. Added a pulsing micro-interaction and "Refreshing..." status bar for feedback.
- **Full Dockerization:** Configured multi-container orchestration via root [docker-compose.yml](file:///c:/Users/admin/Documents/GitHub/DPS-Technical-challenge/docker-compose.yml) and separate optimized Dockerfiles for [frontend](file:///c:/Users/admin/Documents/GitHub/DPS-Technical-challenge/frontend/Dockerfile) and [backend](file:///c:/Users/admin/Documents/GitHub/DPS-Technical-challenge/backend/Dockerfile).
- **Production Resiliency & Testing:** Implemented a robust 76-test Vitest suite, upstream single-retries on transient status errors, 4s request timeouts, 15s client-side timeouts, origin-based CORS protection, `X-Request-ID` request headers, and graceful shutdowns (`SIGINT`/`SIGTERM` handlers).

### Known Limitations

- iRail only covers Belgian railway stations — not fictional "Lagovia" stations. We treat this as the data source for the challenge as specified in the brief.
- The station list cache means a newly opened/closed station may take up to 1 hour to reflect.
- No authentication layer — this matches the open, no-auth nature of the iRail API.

## AI Usage

See [AI_USAGE.md](./AI_USAGE.md) for a full transparency report on how AI tools were used throughout this project.
