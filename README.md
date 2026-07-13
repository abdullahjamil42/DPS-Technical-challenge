# Lagovia Train Tracker 🚆

> **DPS Munich Software Engineer Challenge Submission**

A full-stack application that lets users search any Belgian railway station and see departures leaving in the **next 15 minutes** — with live delay, platform, and cancellation information.

Built with a deliberate emphasis on clean architecture, testability, and product-minded engineering.

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Backend | Node.js 20 + Express 5 | DPS preferred stack; excellent async I/O |
| Validation | Zod | Schema-first, type-safe query validation |
| Caching | node-cache | Avoids hammering iRail; stations cached 1hr, liveboards 30s |
| Frontend | React 19 + Vite | DPS preferred; fast HMR |
| Data Fetching | TanStack Query | Declarative fetching, auto-refetch, loading/error states |
| Styling | Vanilla CSS (Modules) | No framework overhead; showcases CSS mastery |
| Testing | Vitest + Supertest + React Testing Library | Fast, ESM-native test runner |

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
- **Frontend UI:** http://localhost:5173
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

## Architecture

```
DPS-Technical-challenge/
├── backend/                  # Node.js + Express API
│   └── src/
│       ├── app.js            # Express factory (testable)
│       ├── config.js         # All env & tuning constants
│       ├── routes/           # HTTP layer (validation only)
│       ├── services/         # Business logic (pure functions)
│       ├── middleware/       # Error handler
│       └── utils/            # Time utilities
└── frontend/                 # React + Vite SPA
    └── src/
        ├── hooks/            # useDepartures (React Query)
        ├── services/         # Fetch wrapper
        └── components/       # SearchBar, DepartureList, StationGroup, DepartureCard
```

### Key Design Decisions

**1. Service-layer separation.** Business logic (station matching, time filtering, normalization) is isolated in `departureService.js`. The route handler only handles HTTP concerns. This is the most important architectural decision — it makes unit testing trivial and future refactoring safe.

**2. Dual caching strategy.** The iRail station list (~600 stations) is cached for 1 hour; liveboards are cached for 30 seconds. This prevents API rate-limit errors while keeping departure data near-real-time.

**3. Parallel liveboard fetches.** If "Bru" matches 5 stations, we fetch all 5 liveboards concurrently with `Promise.all`. The alternative (sequential) would be 5× slower.

**4. Graceful degradation.** If a single station's liveboard fetch fails, it is omitted from the result rather than failing the entire request. The user still sees results for all other matched stations.

**5. Backend-side time filtering.** The 15-minute window filter lives on the server, not the client. This is a deliberate API design choice — clients should not be responsible for interpreting business rules.

**6. React Query auto-refetch.** The frontend polls every 30 seconds automatically, giving a live departure board feel without implementing manual polling or WebSockets.

### Known Limitations

- iRail only covers Belgian railway stations — not fictional "Lagovia" stations. We treat this as the data source for the challenge as specified in the brief.
- The station list cache means a newly opened/closed station may take up to 1 hour to reflect.
- No authentication layer — this matches the open, no-auth nature of the iRail API.

### What I Would Add With More Time

- **Redis** for distributed caching (scales horizontally)
- **WebSocket** for real-time push instead of 30s polling
- **Fuzzy search** with Levenshtein distance for typo tolerance
- **i18n support** (Dutch/French/English station names)
- **E2E tests** with Playwright
- **Docker Compose** for one-command full-stack startup

---

## AI Usage

See [AI_USAGE.md](./AI_USAGE.md) for a full transparency report on how AI tools were used throughout this project.

---

*Built with ❤️ for Digital Product School Munich*
