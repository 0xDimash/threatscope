# ThreatScope 3D

> Development of an Interactive 3D Platform for Cybersecurity Threat Visualization and Analysis

Real diploma project (replaces the `threat-3d-mvp` prototype). The MVP proved the 3D idea;
this repository is the actual product: real data ingestion, a backend with an event store,
and a maintainable 3D frontend.

**Status:** phase 1 — contract, skeleton, SQLite, synthetic feed running end to end. Real
ingestion (Zeek / Suricata / syslog) is next.

---

## Team

| Person | Background | Role | Owns |
|---|---|---|---|
| **Design & product** | Digital management & design | Product owner, UX/UI, 3D visualization lead | `frontend/`, `docs/`, presentation, project board |
| **Cybersecurity A** | Cybersecurity | Threat intelligence & detection lead | `backend/app/ingest/`, `backend/app/services/` (risk engine, MITRE mapping), `docs/threat-model.md` |
| **Cybersecurity B** | Cybersecurity | Platform / infrastructure lead | `backend/app/api/`, `backend/app/core/`, `backend/app/models/`, `infra/`, CI/CD, deployment |

Nobody here is a dedicated full-stack dev, so the split below is **by domain, not by layer**.
Everyone touches "full stack" inside their own area, but only one person owns each file zone.
See [`docs/team.md`](docs/team.md) for the full responsibility matrix and the interfaces
between the three areas.

---

## Architecture (one paragraph)

Browser (Three.js/Vite) ⇄ REST + WebSocket ⇄ FastAPI backend ⇄ SQLite (single file).
A parser layer normalises heterogeneous security feeds (Zeek, Suricata, syslog, Windows Event,
CSV/JSON) into a single **`SecurityEvent`** contract; a service layer enriches it (severity,
MITRE ATT&CK technique, asset mapping, risk score); the API streams events to the frontend,
which renders them as animated attack arcs on a 3D city model.

```
 ┌────────────┐   REST/WS    ┌──────────────┐   SQL   ┌───────────────────┐
 │  frontend  │ ───────────▶ │   backend    │ ──────▶ │  SQLite            │
 │  (Three.js)│ ◀─────────── │  (FastAPI)   │         │  backend/data/*.db │
 └────────────┘              └──────┬───────┘         └───────────────────┘
                                    │ ingest
                              ┌─────▼──────┐
                              │ parsers    │ ◀── Zeek / Suricata / syslog /
                              │ normalise  │     Windows Event / CSV / JSON
                              └────────────┘ ◀── simulator/ (demo feed)
```

Full detail: [`docs/architecture.md`](docs/architecture.md) ·
Stack decision: [`docs/adr/0001-stack.md`](docs/adr/0001-stack.md), [`0002-sqlite.md`](docs/adr/0002-sqlite.md) ·
Shared data contract: [`docs/api-contract.md`](docs/api-contract.md)

---

## Repository layout

```
threatscope/
├── frontend/        # Vite + TypeScript + Three.js 3D UI
├── backend/         # FastAPI: API, ingestion, risk engine, SQLite file
├── simulator/       # synthetic attack feed for demos & tests
├── infra/           # docker-compose, Dockerfiles
├── docs/            # architecture, threat model, API contract, ADRs
├── .github/         # PR template, CI
└── Makefile         # one-liners for the whole team
```

---

## Getting started

Prerequisites: Node 20+, Python 3.9+, Docker Desktop (optional).

```bash
git clone git@github.com:0xDimash/threatscope.git
cd threatscope
cp .env.example .env
make up                       # docker: backend + frontend
make simulate                 # stream synthetic attacks
```

Without Docker:

```bash
make backend      # uvicorn on :8000
make frontend     # vite on :5173
make simulate     # stream fake attacks
```

---

## Using AI agents

This repo carries its own agent instructions. Point an agent at [`AGENTS.md`](AGENTS.md); for a
first session, send it the role prompt from [`docs/agent-prompt.md`](docs/agent-prompt.md).

## Git workflow (3 people)

`main` is protected (see [Branch protection](#branch-protection-repo-owner-once)) and always
runnable. Everything happens on short-lived branches merged by pull request.

```
main ───●────────────●────────────●──────▶  always demo-ready
         \          /  \          /
          ●───●────●    ●───●────●          feat/…  (1 branch = 1 task)
```

Rules:

1. **One branch per task**, named `feat/<area>-<short>`, `fix/…`, `docs/…`, `chore/…`.
   Example: `feat/frontend-attack-arcs`, `feat/ingest-suricata-parser`.
2. **Never push to `main` directly** — PR + 1 approval from another member.
3. **Small PRs** (< ~400 lines). If it is bigger, split it.
4. **Rebase on `main` before opening** (`git pull --rebase origin main`).
5. **Commit messages**: `type(scope): summary` — `feat(frontend): add severity filter`,
   `fix(ingest): handle empty zeek conn.log`.
6. **Work in progress**: open the PR as *Draft* so others can see direction early.
7. **Files outside your zone**: open an issue / ask the owner, do not edit.

Branches and conventions in detail: [`docs/team.md`](docs/team.md#git-conventions).

### Clone

```bash
git clone git@github.com:0xDimash/threatscope.git
cd threatscope
git config user.name "<Your Name>"
git config user.email "<id>+<username>@users.noreply.github.com"
```

Use SSH: add your public key once under GitHub → Settings → SSH and GPG keys, then verify with
`ssh -T git@github.com`. If you push over HTTPS, GitHub needs a personal access token, not a
password.

Troubleshooting:

| Error | Cause | Fix |
|---|---|---|
| `403 ... denied to <user>` | invite not accepted, or wrong account cached | accept the invite; clear the cached credential |
| `GH007: ... private email address` | commit email is a private address | set the repo-local email to `<id>+<username>@users.noreply.github.com` |

### Branch protection (repo owner, once)

Settings → Branches → Add branch protection rule → `main` → require a pull request and
1 approval. Until this is on, the rules below are enforced by discipline only.

---

## Roadmap (high level)

| Phase | Goal | Lead |
|---|---|---|
| 1 | Contracts + skeleton + docker + sample data flowing end-to-end | all |
| 2 | Real ingestion (Zeek/Suricata/syslog), asset inventory, event store | Cyber A + B |
| 3 | Risk engine, MITRE ATT&CK mapping, correlation, kill-chain state | Cyber A |
| 4 | 3D visualization polish: city model, arcs, impact FX, HUD | Design |
| 5 | Analysis views: timelines, drill-down, filtering, replay, export | Design + Cyber A |
| 6 | Auth, deployment, hardening, performance, thesis figures | Cyber B + Design |
