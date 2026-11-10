# ADR 0001 — Technology stack

- **Status:** proposed (confirm at week 1 sync)
- **Date:** 2026-11-10

## Context

Three-person student team: one digital management/design, two cybersecurity. The prototype
(`threat-3d-mvp`) is a plain static page with vanilla JS + Three.js from a CDN. The real
project needs real data ingestion, persistence, an API, and a maintainable UI — but the team
has limited software-engineering hours and no dedicated full-stack developer.

## Decision

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Vite + TypeScript + Three.js** | Reuses the existing Three.js expertise; no framework to learn; TS gives a typed mirror of the API contract, which is the main integration risk with a split team. |
| Backend | **Python 3.11 + FastAPI + Pydantic** | Python is the native language of security tooling (Zeek/Suricata tooling, log parsing, ATT&CK libraries); FastAPI gives typed schemas + auto OpenAPI, which doubles as the frontend contract. |
| DB | **PostgreSQL + TimescaleDB** | Relational asset inventory + time-series event store in one engine; simple to run in Docker. |
| ORM / migrations | **SQLAlchemy + Alembic** | Standard, migration-first schema changes. |
| Realtime | **WebSocket** (FastAPI native) | Live event feed; simpler than SSE for future client filters. |
| Packaging | **Docker Compose** | One command for the whole stack, reproducible demo. |
| CI | **GitHub Actions** | Free, runs lint/typecheck/tests on every PR. |

## Rejected alternatives

- **React + react-three-fiber** — nicer component model, but requires rewriting the working MVP
  and adds a paradigm (hooks, reconciliation) the team does not need for a 3D canvas app.
- **Node/Express backend** — would let one language cover everything, but the cybersecurity
  members' tooling and course background is Python-first.
- **MongoDB** — flexible, but the asset/risk model is relational and we want SQL for analysis.
- **No build step (keep CDN Three.js)** — fine for the MVP, untenable for typed integration,
  module structure, and testing at this size.

## Consequences

- Two runtimes (Node + Python) → Docker Compose and a `Makefile` hide the difference.
- Typed contract (`docs/api-contract.md` + generated OpenAPI) is mandatory, not optional.
- TimescaleDB image pins are needed for ARM (Apple Silicon) — covered in `infra/`.

## Revisit if

- The team standardises on one language and wants to drop Python.
- Real-time performance demands move rendering off the main thread (consider Web Workers).
