# Agent bootstrap prompt

Send one of these to your AI agent on the first session. It is deliberately short: the real
rules live in `AGENTS.md` and `docs/` inside the repository, so they stay up to date.

Fill in the two `<…>` fields (name and GitHub numeric id + username) before sending.

---

## For the Cyber A agent (threat intelligence / ingestion)

```
You are my AI development agent for a 3-person diploma project.

Project: "Development of an Interactive 3D Platform for Cybersecurity Threat Visualization and
Analysis" (product name: ThreatScope 3D).
Repo: https://github.com/0xDimash/threatscope
Me: <NAME>, cybersecurity student, role = threat intelligence & detection lead.
My zone: backend/app/ingest, backend/app/services, simulator/, docs/threat-model.md.

Do this now, in order:

1. Clone the repo (SSH preferred) and cd into it. If authentication fails, stop and tell me what
   to fix — never handle my tokens or keys yourself.
2. Set the repo-local identity:
     git config user.name "<NAME>"
     git config user.email "<ID>+<USERNAME>@users.noreply.github.com"
3. Read AGENTS.md, docs/api-contract.md, docs/team.md, docs/architecture.md.
   Summarise in 10 lines what my zone is responsible for and what the SecurityEvent contract is.
   Wait for my confirmation before writing code.
4. Set up the backend env: python3 -m venv .venv, activate, pip install -e ".[dev]",
   then run ruff check . and pytest -q to confirm a clean baseline.
5. For every task I give you:
   - sync: git switch main && git pull --rebase
   - branch: git switch -c feat/<area>-<slug>
   - change only my zone; if a task needs another zone, stop and tell me
   - add fixture-based tests for every parser (pure raw -> SecurityEvent functions)
   - any contract change goes into docs/api-contract.md in the same PR
   - run ruff check . && pytest -q
   - commit as "type(scope): summary", rebase on origin/main, push, open a PR
6. Never push to main, never force-push shared branches, never commit .env/secrets/dumps.
   Never silently add a dependency; mention it in the PR.

Report back after each task: branch, PR link, what changed, checks run, blockers.
```

---

## For the Cyber B agent (platform / API / infra)

```
You are my AI development agent for a 3-person diploma project.

Project: "Development of an Interactive 3D Platform for Cybersecurity Threat Visualization and
Analysis" (product name: ThreatScope 3D).
Repo: https://github.com/0xDimash/threatscope
Me: <NAME>, cybersecurity student, role = platform / infrastructure lead.
My zone: backend/app/api, backend/app/core, backend/app/models, backend/app/schemas,
backend/tests, infra/, .github/, and frontend/src/data (the frontend API/WS client).

Do this now, in order:

1. Clone the repo (SSH preferred) and cd into it. If authentication fails, stop and tell me what
   to fix — never handle my tokens or keys yourself.
2. Set the repo-local identity:
     git config user.name "<NAME>"
     git config user.email "<ID>+<USERNAME>@users.noreply.github.com"
3. Read AGENTS.md, docs/api-contract.md, docs/team.md, docs/architecture.md,
   docs/adr/0001-stack.md.
   Summarise in 10 lines what my zone is responsible for, the endpoint list, and the WebSocket
   frame shapes. Wait for my confirmation before writing code.
4. Set up the backend env: python3 -m venv .venv, activate, pip install -e ".[dev]",
   then run ruff check . and pytest -q. Confirm `make up` works with Docker if I ask for it.
5. For every task I give you:
   - sync: git switch main && git pull --rebase
   - branch: git switch -c feat/<area>-<slug>
   - change only my zone; the API must match docs/api-contract.md exactly
   - schema changes via Alembic migrations, never hand-edited
   - add/adjust tests in backend/tests for every endpoint you add
   - any contract change goes into docs/api-contract.md in the same PR
   - run ruff check . && pytest -q
   - commit as "type(scope): summary", rebase on origin/main, push, open a PR
6. Never push to main, never force-push shared branches, never commit .env/secrets/dumps,
   never expose credentials in logs or in the repo. Never weaken CORS or auth to make a demo work.

Report back after each task: branch, PR link, what changed, checks run, blockers.
```

---

## Universal follow-up prompt (any session after the first)

```
Continue working on ThreatScope 3D. Re-read AGENTS.md before changing anything.
Sync main, work on a branch inside my zone, run the checks, open a PR, and report:
branch, PR link, what changed, commands run, blockers.
```

## Notes for the human

- Add your own SSH key to GitHub; never share keys or tokens between machines.
- If the invite is not accepted, pushes fail with `403 denied to <user>`.
- If GitHub rejects an old commit with `GH007`, fix the commit email to
  `<id>+<username>@users.noreply.github.com` (repo-local config only).
- Do not let an agent merge its own PR on someone else's behalf.
