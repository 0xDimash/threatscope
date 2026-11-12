# Backlog — current sprint

Six issues, one per lane slot. Copy each into GitHub Issues (or create them from the prefilled
links) and assign the owner. A task is done when CI is green and it
runs from `main`.

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

- [ ] **Suricata `eve.json` parser** (see task 1 below)

The contract also gained `GET /api/state`, `GET /api/assets/{id}/risk` and the `risk_snapshots`
table (empty until the risk engine writes to it). Phase 1 is closed; phase 2/3 work begins.

---

## Sprint 2

### 1. Suricata `eve.json` parser *(carried over from sprint 1)*

**Owner:** Threat intel · **Zone:** `backend/app/ingest`, `backend/tests`, `docs/threat-model.md`
· **Depends on:** nothing · **Branch:** `feat/ingest-suricata`

- [ ] pure function `raw -> list[SecurityEvent]`, same pattern as `zeek.py`
- [ ] register in the `ADAPTERS` dict in `backend/app/api/ingest.py`
- [ ] signature → `type`/`severity`/MITRE mapping documented in `docs/threat-model.md`
- [ ] fixture under `backend/tests/fixtures/suricata/`
- [ ] tests mirroring `test_ingest_zeek.py`
- [ ] malformed/partial lines are skipped, never raise

**Done when:** ~15 tests green and `POST /api/ingest {"source":"suricata"}` accepts a real
`eve.json` chunk without changes elsewhere.

### 2. Asset mapping — IP/host → `asset_id`

**Owner:** Threat intel · **Zone:** `backend/app/services`, `docs/threat-model.md`
· **Depends on:** nothing · **Branch:** `feat/services-asset-mapping`

Adapters currently leave `src.asset_id` / `dst.asset_id` as `null`; the frontend cannot draw
arcs to an asset until the repository maps them.

- [ ] `services/mapping.py`: lookup of `ip` / `host` against the `assets` table
- [ ] applied in `repository.add_events` before insert (single place, adapters stay pure)
- [ ] unknown IPs stay `null` — never a guessed asset
- [ ] tests: known IP mapped, unknown IP stays `null`
- [ ] note in `docs/threat-model.md` on how assets register their addresses

**Done when:** ingested Zeek events land with a real `dst.asset_id`. Consumed by the frontend
(arcs), risk engine (per-asset scoring) and the events API filter (`?asset_id=`).

### 3. Risk engine → `risk_snapshots` + `risk` frames

**Owner:** Threat intel · **Zone:** `backend/app/services`, `docs/threat-model.md`
· **Depends on:** #2 · **Branch:** `feat/services-risk-engine`

- [ ] scoring pass over recent events: `risk_delta` × criticality decay into `risk_snapshots`
- [ ] `state` 0..1 → `ok | elevated | critical | compromised` per contract
- [ ] `GET /api/assets/{id}/risk` reads the latest snapshot (shape unchanged)
- [ ] `GET /api/state`: `threat_level` derived from scores, not worst-severity-in-window
- [ ] WS broadcasts a `risk` frame after each scoring pass
- [ ] scoring parameters documented in `docs/threat-model.md` (thesis material)

**Done when:** hammering one asset with ingests raises its risk visibly in `/api/state` and
the `risk` frame — without any API shape change.

### 4. Frontend WS client + live feed wiring

**Owner:** Platform · **Zone:** `frontend/src/data` (Design contributes)
· **Depends on:** nothing (all backend endpoints exist) · **Branch:** `feat/data-ws-client`

- [ ] `frontend/src/data/api.ts`: typed REST wrappers for `/api/assets`, `/api/events`,
  `/api/state`, `/api/assets/{id}/risk`
- [ ] `frontend/src/data/socket.ts`: reconnecting WS client emitting the three frame kinds
- [ ] frames parsed against `frontend/src/types/contract.ts`; unknown `kind` ignored, not thrown
- [ ] `VITE_API_BASE` env switch: mock fixtures vs live backend
- [ ] manual check: two tabs, events from `make simulate` visible in both

**Done when:** Design consumes a live feed by importing one module — no `fetch` in `scene/`.

### 5. Attack arcs — `frontend/src/viz`

**Owner:** Design · **Zone:** `frontend/src/viz` · **Depends on:** #4 (starts on fixtures)
· **Branch:** `feat/viz-attack-arcs`

- [ ] arc from `src` → `dst.asset_id`, coloured by severity (`scene/palette.ts`)
- [ ] events without a mapped `dst.asset_id` shown as arcs to the district edge / dropped
  gracefully — decision recorded in the PR
- [ ] rise/fade animation, 26 assets + arcs at 60 fps
- [ ] unknown `severity`/`type` degrade to neutral styling, never throw
- [ ] driven by `contract-fixtures.ts` until #4 lands, then the socket
- [ ] screenshot or short recording in the PR

**Done when:** the city visibly "lights up" as `make simulate` streams attacks.

### 6. HUD — event feed, asset panel, filters

**Owner:** Design · **Zone:** `frontend/src/ui`, `frontend/src/styles`
· **Depends on:** #4 · **Branch:** `feat/ui-hud`

- [ ] live event list: severity chip, type, `dst` asset, time (ISO → local)
- [ ] click asset → detail panel (name, kind, criticality, district, ip, tags, RiskState)
- [ ] threat-level banner + severity counts from `/api/state`; kill-chain meter
- [ ] severity filter feeding the client (contract already reserves the `filter` frame for later)
- [ ] unknown values render as `—`/`other`, never crash
- [ ] screenshot in the PR

**Done when:** a non-team member can narrate what is happening from the HUD alone in <30 s.

---

## Next after this sprint

Replay/time controls, drill-down timeline, export for thesis figures (Design + Cyber A);
auth, deployment, hardening (Cyber B). Blocked until #3–#6 exist.
