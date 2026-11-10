# Architecture

## Goal

Turn a stream of raw security telemetry into an interactive 3D picture of a city's
infrastructure under attack, and let an analyst explore *what happened, where, and how bad*.

## Layers

### 1. Ingestion (`backend/app/ingest/`)

Adapters that read a source and emit normalised `SecurityEvent` objects.

| Adapter | Input | Notes |
|---|---|---|
| `csv_json.py` | uploaded CSV/JSON | already in contract or mapped by header |
| `zeek.py` | `conn.log`, `dns.log`, `notice.log` (TSV/JSON) | network sessions |
| `suricata.py` | `eve.json` | IDS alerts with signature + severity |
| `syslog.py` | RFC5424 / RFC3164 lines | firewalls, Linux hosts |
| `win_evtx.py` | Windows Event Log export | later phase |
| `simulator` | synthetic | lives in `simulator/`, emits same contract |

Every adapter is a pure function `raw -> Iterable[SecurityEvent]`, unit-tested with fixture
files. No DB, no HTTP inside adapters.

### 2. Enrichment (`backend/app/services/`)

- **asset mapping** — resolve an IP/hostname to a known `Asset` (or create a stub).
- **classification** — map signature/log type to a category and a MITRE ATT&CK technique.
- **risk engine** — accumulate per-asset risk from event severity/frequency, expose
  `compromised` state and a city-wide threat level.
- **correlation** — group related events into an incident / kill-chain progress.

Pure-ish logic with the DB injected, so it is testable.

### 3. API (`backend/app/api/`)

FastAPI routers. REST for resources, WebSocket for the live feed.

- `GET /api/assets` — the city inventory (nodes + links the frontend renders).
- `GET /api/events?from&to&severity&type&asset` — historical query.
- `GET /api/assets/{id}/risk` — risk state for one node.
- `GET /api/state` — aggregate: threat level, counts, kill-chain, top classes.
- `WS /ws/events` — live `SecurityEvent` frames.
- `GET /healthz` — liveness.

OpenAPI is auto-generated at `/docs` — that is the backend's contract with the frontend.

### 4. Persistence (`backend/app/models/`, `infra/db/`)

- PostgreSQL, `timescaledb` extension for `events` (hypertable by `ts`).
- Tables: `assets`, `links`, `events`, `risk_snapshots`, `incidents`.
- SQLAlchemy models + Alembic migrations. Migrations are the only way to change schema.

### 5. Frontend (`frontend/`)

Vite + TypeScript + Three.js. Modules:

| Dir | Responsibility |
|---|---|
| `scene/` | renderer, camera, lights, environment, city model, asset meshes |
| `viz/` | attack arcs, particles, shockwaves, bloom/composer, kill-chain FX |
| `ui/` | HUD, panels, filters, playback, drill-down, legends |
| `data/` | API client, WebSocket client, stores, `mock.ts` |
| `types/` | TypeScript mirror of the API contract |

Rendering must stay decoupled from data: `scene` and `viz` receive plain objects, never call
`fetch`. Only `data/` talks to the network. That means the whole 3D layer is developable with
`mock.ts`.

## Data flow

```
raw feed ──▶ adapter ──▶ SecurityEvent ──▶ enrichment ──▶ DB
                                              │
                                              └──▶ WS broadcast ──▶ frontend store ──▶ scene/viz/ui
```

## Non-goals (keep scope realistic)

- No microservices. One backend, one DB, one frontend.
- No Kubernetes. Docker Compose for dev and demo.
- No custom ML detection. Rule/heuristic-based scoring is enough for the thesis.
- No real cloud deployment requirement; a single VPS or local demo is acceptable.

## Quality bars

- Backend: `ruff` + `pytest`, adapters covered by fixture tests, ≥70% on services.
- Frontend: `tsc --noEmit` + `eslint`, 60 fps target with ≤ 200 concurrent live events.
- Every PR that changes the contract updates `docs/api-contract.md` in the same PR.
