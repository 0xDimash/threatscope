# Backlog — current sprint

One section per sprint, one task per lane slot. Copy each into GitHub Issues and assign the
owner. A task is done when CI is green and it runs from `main`.

Reference: [`parallel-work.md`](parallel-work.md) for the seams,
[`api-contract.md`](api-contract.md) for the shapes,
[`team.md`](team.md) for zone ownership.

---

## Sprint 1 — shipped (updated 2026-11-12)

| Task | Lane | PR |
|---|---|---|
| `data/assets.json` shared inventory (26 assets, 33 links) | Design | #8 |
| City model ported into `frontend/src/scene` | Design | #13 |
| Backend models + Alembic + seed | Platform | #9 |
| `POST /api/ingest` + DB-backed events/assets API | Platform | #10 |
| Live feed `WS /ws/events` | Platform | #11 |
| Contract fixtures validated against parser and types | shared | #12 |

Not done from sprint 1 — carried into sprint 2:

- [x] **Suricata `eve.json` parser** (see task 1 below) — shipped in #21, registered in #28

The contract also gained `GET /api/state`, `GET /api/assets/{id}/risk` and the `risk_snapshots`
table (empty until the risk engine writes to it). Phase 1 is closed; phase 2/3 work begins.

---

## Sprint 2 — shipped (updated 2026-11-25)

The product moved from the city model to the **room** scene in #16; the city scene is kept as
`frontend/src/scene/city.legacy.ts` and is no longer mounted. Sprint 2 frontend work landed in
the room.

| Task | Lane | PR |
|---|---|---|
| 1. Suricata `eve.json` parser + adapter registration | Threat intel | #21, #28 |
| 2. Asset mapping — IP/host → `asset_id` | Threat intel | #29 |
| 3. Risk engine → `risk_snapshots` + `risk` frames | Threat intel | #30 |
| — Kill-chain progress derived from event types | Threat intel | #31 |
| 4. Frontend REST + WS client (`frontend/src/data`) | Platform | #19 |
| 5. Attack arcs — room (`viz/roomArcs.ts`), live from the socket | Design | #18, #23 |
| 6. HUD — event feed, threat banner, kill chain, severity filter, detail card | Design | #20, #23 |
| — Mobile / vertical HUD layout + screenshots | Design | #23, #27 |
| — Live per-asset risk in the detail card | Design | #24, #32 |
| — Simulator targets the shared inventory | Threat intel | #25 |
| — Demo threat-rate control in the room HUD | Design | #33 |
| — Room devices mapped to inventory assets (`scene/roomMap.ts`) | Design | #35 |
| — Custom spaces: create, build from scratch, edit (localStorage only) | Design | #37, #38, #39 |
| — Electron desktop build (moved to its own repo) | Platform | #34, reverted in #36 |

Arcs are **monochrome**: severity is carried by line width, opacity, dash pattern and packet
size instead of colour (`STYLES` in `viz/roomArcs.ts`). Unknown `severity` falls back to the
`info` style.

Not done from sprint 2 — carried into sprint 3:

- [ ] **Unmapped destinations (task 5).** An event whose `dst.asset_id` is not in the room is
  hashed onto a stable device, so the arc lands on a device that was not attacked. That
  contradicts the "never a guessed asset" rule. Decision still to make and record.
- [ ] **60 fps with arcs (task 5).** Measured for the city scene (`docs/scene.md`), not for the
  room under `make simulate` load.
- [ ] **Asset fields in the detail card (task 6).** It shows id + RiskState only; name, kind,
  criticality, district, ip and tags are missing.
- [ ] **Event row shows host/ip, not the asset name (task 6).**
- [ ] **"Narrate in <30 s" check (task 6)** — not run with a non-team member yet.

---

## Sprint 3

### 1. Persistent spaces — `spaces` resource

**Owner:** Platform (Threat intel for per-device scoring) · **Zone:** `backend/app/models`,
`backend/app/schemas`, `backend/app/api`, `backend/app/services`, `backend/tests`,
`docs/api-contract.md` · **Depends on:** nothing · **Branch:** `feat/api-spaces`

Full spec: [`tasks/backend-spaces.md`](tasks/backend-spaces.md).

**Done when:** a space created in one browser opens in another, and its bound devices show
real risk.

### 2. Spaces on the backend — frontend

**Owner:** Design · **Zone:** `frontend/src/ui`, `frontend/src/scene` (client calls in
`frontend/src/data` with Platform) · **Depends on:** #1 (starts on a mock of the contract)
· **Branch:** `feat/ui-spaces-api`

- [x] create / edit / delete through `/api/spaces`; `localStorage` kept only as an offline cache
- [x] each placed device gets a stable `id` and an optional `asset_id` binding in the builder
- [x] `roomMap.ts` hard-coded pairs replaced by the seeded `room` space
- [x] unbound devices say so in the detail card instead of `no risk data`

### 3. Honest arcs for unmapped destinations

**Owner:** Design · **Zone:** `frontend/src/viz` · **Depends on:** nothing
· **Branch:** `fix/viz-unmapped-dst`

- [ ] remove the hash fallback in `viz/roomArcs.ts`
- [ ] unmapped events end at a neutral "unknown target" marker (or are counted, not drawn) —
  decision recorded in the PR
- [ ] fps measured in the room under `make simulate`, added to `docs/scene.md`

### 4. HUD detail card + event rows use the inventory

**Owner:** Design · **Zone:** `frontend/src/ui` · **Depends on:** nothing
· **Branch:** `feat/ui-asset-detail`

- [ ] detail card: name, kind, criticality, district, ip, tags (from `/api/assets`) above RiskState
- [ ] event rows show the asset name when `dst.asset_id` is mapped, host/ip otherwise
- [ ] missing values render as `—`
- [ ] narration test with one non-team person, result noted in the PR

### 5. Replay / time controls

**Owner:** Design (Threat intel for a recorded scenario) · **Zone:** `frontend/src/ui`,
`frontend/src/viz`, `simulator/` · **Depends on:** nothing (`GET /api/events` already takes
`from,to`) · **Branch:** `feat/ui-replay`

- [ ] pause / play / speed and a scrub bar over a time window
- [ ] replay re-drives the same arcs and HUD as the live feed
- [ ] one recorded demo scenario that plays the same way every time (defence safety net)

### 6. Design documentation for the thesis

**Owner:** Design · **Zone:** `docs/design/` · **Depends on:** nothing
· **Branch:** `docs/design-system`

- [ ] palette, severity encoding (why monochrome), typography, HUD layout and breakpoints
- [ ] key decisions with before/after screenshots (reuse `docs/images/ui/`)
- [ ] figures exportable for the thesis

---

## Next after this sprint

Drill-down timeline and export for thesis figures (Design + Threat intel); auth, deployment,
hardening (Platform, below). More parsers — syslog, Windows Event (Threat intel).

### Cybersecurity B (Platform) — follow-ups

Ordered by dependency; every item needs its own branch and PR.

- [ ] **Auth** — token issue/verify, protect `/api/ingest*` and the WS handshake; document the
  flow in `docs/api-contract.md` before merging
- [ ] **Postgres cut-over** — verify `DATABASE_URL` swap, migrations and the two event indexes
  on a real Postgres instance; no model changes
- [ ] **Deployment** — reverse proxy + TLS in front of `infra/docker-compose.yml`, healthchecks,
  restart policy, `.env` template for production
- [ ] **Retention & backup** — scheduled prune of old `events` / `risk_snapshots`, SQLite backup
  step in the runbook
- [ ] **Hardening** — request size limits on ingest, rate limiting, CORS allow-list per
  environment, dependency audit in CI
- [ ] **Operational runbook** — start, seed, reset, migrate, troubleshoot in `README.md`

