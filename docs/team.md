# Team responsibilities & collaboration

Three people. Two backgrounds. One product. The goal of this document is that **nobody ever
waits for somebody else**: each area exposes a contract, and everyone can work against the
contract independently.

## The principle

Split by **domain ownership**, not by "frontend guy / backend guy". With one designer and two
security people, a naive frontend/backend split leaves the backend under-staffed and the
designer blocked on data. Instead:

- **You** own everything the user sees and the product direction.
- **Cyber A** owns the *security meaning* of the data (what an event is, how severe it is,
  what attack it represents).
- **Cyber B** owns the *platform* (API, database, deployment, CI) and is the person who turns
  Cyber A's logic into a service and your screens into an API.

## Responsibility matrix

Legend: **O** = owner (decides and reviews the zone), **C** = contributes, **R** = reviewer.

| Area | Files | You | Cyber A | Cyber B |
|---|---|:--:|:--:|:--:|
| Product vision, scope, prioritisation | issue board, `README.md` | **O** | C | C |
| UI/UX, design system, thesis figures | `frontend/`, `docs/design/` | **O** | – | – |
| 3D scene, city model, attack FX | `frontend/src/scene`, `frontend/src/viz` | **O** | – | R |
| HUD, panels, filters, replay controls | `frontend/src/ui` | **O** | C | – |
| Frontend API/WS client | `frontend/src/data` | C | – | **O** |
| Shared event contract | `docs/api-contract.md` | C | **O** | C |
| Ingest parsers (Zeek, Suricata, syslog, EVTX) | `backend/app/ingest` | – | **O** | R |
| Threat model, ATT&CK mapping, risk engine | `backend/app/services`, `docs/threat-model.md` | – | **O** | C |
| REST/WS API, auth, schemas | `backend/app/api`, `backend/app/core` | – | C | **O** |
| Database schema & migrations | `backend/app/models`, `backend/migrations`, `backend/app/core/db.py` | – | C | **O** |
| Docker, CI, deployment, secrets | `infra/`, `.github/` | – | – | **O** |
| Simulator (demo attack feed) | `simulator/` | C | **O** | C |
| Tests | `backend/tests`, `frontend` tests | – | C | **O** |

Rule of thumb: **the O decides what goes into that zone and is the person to review it.**
Anyone may propose a PR there; merges are gated by CI (`test` + `typecheck`), not by approval,
so merge your own PR once the checks are green.

## How the three areas connect

Two explicit contracts keep the team decoupled:

### 1. The data contract — `docs/api-contract.md`

A single `SecurityEvent` JSON shape (and `Asset`, `RiskState`). Owned by Cyber A.
Frontend mocks it, backend implements it, simulator emits it.

- **Cyber A** defines *what fields mean* (semantics, severity scale, ATT&CK fields).
- **Cyber B** defines *how it travels* (endpoint paths, pagination, WS frames).
- **You** define *what must be visible* (which fields the UI actually needs).

Change process: propose in a PR to `docs/api-contract.md`, all three approve, then code.

### 2. The mock-first rule

Nobody blocks on the backend:

- **You** build the UI against `frontend/src/data/mock.ts` implementing the contract.
- **Cyber B** implements the same contract in FastAPI and serves OpenAPI docs at `/docs`.
- **Cyber A** makes the simulator emit the contract, so integration is testable without real
  traffic.

Swap mock → real by changing one env var (`VITE_API_BASE`).

## Suggested weekly rhythm

| Ritual | When | Output |
|---|---|---|
| 15-min sync | Mon | what each person does this week, blockers |
| Contract review | when `api-contract.md` changes | merged agreed schema |
| Demo | Fri | main branch running, 5-minute walkthrough |
| Retro + backlog grooming | Fri | next week's issues assigned |

Definition of done for a task: code merged to `main`, runs via `make up`, covered by a test or
a documented manual check, and visible in the Friday demo.

## Git conventions

- Branch: `feat/<area>-<slug>`, `fix/<area>-<slug>`, `docs/<slug>`, `chore/<slug>`.
  Areas: `frontend`, `ingest`, `api`, `infra`, `sim`.
- Commit: `type(scope): imperative summary` ≤ 72 chars. Types: `feat`, `fix`, `docs`,
  `refactor`, `test`, `chore`, `perf`.
- PR title = same format. PR body: what / why / how tested / screenshots (UI PRs must have a
  screenshot or a short screen recording).
- No approval required. Merge your own PR once CI (`test` + `typecheck`) is green; squash and
  delete the branch. Ask the zone owner to review if you are unsure.
- Keep `main` green. If you break it, fix it forward or revert immediately.
- Never commit `.env`, credentials, dumps, or large binaries. Datasets go to `infra/data/`
  (gitignored) and are documented, not committed — or use Git LFS if truly needed.

## Ownership boundaries in practice

- Adding a new event type → Cyber A updates contract + parser; you add the visual; Cyber B
  ensures it is streamed.
- Adding a new screen → you; if it needs new fields → PR to the contract first.
- Adding a new endpoint → Cyber B; API path documented in `api-contract.md`.
- Changing the risk formula → Cyber A; Cyber B keeps the service boundary; you may need to
  change the HUD thresholds, so tell the team in the PR.
