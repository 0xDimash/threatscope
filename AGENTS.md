# AGENTS.md — instructions for AI agents working in this repo

**ThreatScope 3D** is an interactive 3D platform for cybersecurity threat visualization and
analysis, built by a three-person diploma team. This file applies to everyone working in the
repository — humans and AI agents alike — regardless of which team member is being assisted
and which lane the current task covers. It states the rules of the repo; the per-lane
assignments live in `docs/team.md`.

Repository: `https://github.com/0xDimash/threatscope`
Default branch: `main` (protected — **never push to it directly**).

## Read before doing anything

1. `docs/api-contract.md` — the shared data shapes. This is the contract between frontend,
   ingestion, and API. Do not silently change it.
2. `docs/team.md` — ownership lanes and conventions.
3. `docs/architecture.md` — how the pieces fit.
4. `docs/backlog.md` — the current sprint, one task per lane.

## Lanes

The work is split into three lanes, one per team member. A task belongs to one lane, and the
lane decides which paths may be touched.

| Lane | Zone |
|---|---|
| Design — frontend, 3D scene, HUD, product direction | `frontend/src/scene`, `frontend/src/viz`, `frontend/src/ui`, `frontend/src/styles`, `docs/` |
| Threat intel — event meaning, severity, ATT&CK | `backend/app/ingest`, `backend/app/services`, `simulator/`, `docs/threat-model.md` |
| Platform — API, database, deployment, CI | `backend/app/api`, `backend/app/core`, `backend/app/models`, `backend/app/schemas`, `backend/tests`, `infra/`, `.github/`, `frontend/src/data` |
| Shared — all three lanes agree | `docs/api-contract.md` + `contract/` fixtures, `README.md`, `Makefile`, `docs/backlog.md` |

Files at the repository root that are not listed above (`AGENTS.md`, `docs/adr/`,
`.editorconfig`, `.gitignore`) are edited by the lane working on that topic; say so in the PR
body so the other lanes can review.

## Credentials

- Never handle, print, or commit tokens, passwords, or SSH private keys.
- Authentication is the human's job. If `git push` fails for auth reasons, stop and tell the
  human exactly what to do — do not try to work around it.
- Prefer SSH (`git@github.com:0xDimash/threatscope.git`) when the human's key is registered;
  otherwise HTTPS with their credential helper.
- Known failures: `403 denied to <user>` → the GitHub invite is not accepted yet.
  `GH007: publish a private email address` → set the commit email to
  `<id>+<username>@users.noreply.github.com` for this repo only.

## One-time setup (ask the human to confirm before running)

```bash
git clone git@github.com:0xDimash/threatscope.git
cd threatscope
git config user.name "<Their Name>"
git config user.email "<id>+<username>@users.noreply.github.com"
```

Backend without Docker:

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
```

## Session loop

```bash
git switch main
git pull --rebase
git switch -c feat/<area>-<slug>        # or fix/…, docs/…, chore/…
```

1. Implement **only inside the zone of the lane you are working on** (see above).
2. Run the checks for the touched side.
3. Commit in small logical units.
4. Rebase onto `origin/main` before pushing.
5. Push the branch and open a pull request.

```bash
git fetch origin
git rebase origin/main
git push -u origin HEAD
```

## Checks that must pass before a PR

```bash
# backend
cd backend && ruff check . && pytest -q

# frontend
cd frontend && npm run typecheck && npm run build
```

If a check fails, fix it. Do not disable rules, add `# noqa`, or skip tests to get green.

## Commit and PR format

- Commit: `type(scope): imperative summary` — `feat(ingest): parse zeek conn.log`,
  `fix(frontend): clamp severity colour index`.
- Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`.
- PR title = same format. Fill `.github/pull_request_template.md`.
- Any PR touching rendered UI needs a screenshot or short recording in the description.
- Merges are gated by CI, not review: `main` requires the `test` and `typecheck` checks to
  pass. Anyone may merge their own PR once CI is green (squash, delete the branch). Ask the
  zone owner to review if you are unsure.
- Never force-push `main` or a shared branch. Force-push only your own feature branch, and only
  with `--force-with-lease`.

## Ownership zones — do not edit across them

A task that requires changing another lane's zone is not yours to finish. Either **stop and
ask the human**, or open a draft PR scoped to your own zone and describe the needed change in
the PR body. Do not make "drive-by" edits in another zone.

## Contract discipline

- A new or changed field in `SecurityEvent`, `Asset`, `Link`, `RiskState`, or an endpoint must
  update `docs/api-contract.md` **in the same PR**, and the PR must say who consumes it.
- Missing values are `null`, never absent.
- Timestamps are ISO-8601 UTC strings.
- Unknown `type`/`severity`/`kind` values must degrade gracefully in the UI — never throw.

## Never

- Commit `.env`, credentials, tokens, database dumps, `node_modules/`, `.venv/`, build output.
- Run `git add -A` / `git add .` without first checking `git status` and `git diff`.
- Edit generated files by hand: `package-lock.json`, Alembic migrations (generate them),
  `dist/`.
- Delete or rewrite history on `main`.
- Install a new dependency without saying so in the PR body and checking it fits
  `docs/adr/0001-stack.md`.
- Rewrite another member's code to "clean it up" — suggest it in the PR instead.

## When finished, report

- branch name and PR link
- what changed and why
- commands run and their result
- anything blocked, and what you need from the human
