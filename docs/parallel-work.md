# Developing in parallel — three people, one system

Three people, one repo, one product. Parallelism does **not** come from splitting into
"frontend / backend"; it comes from **seams** — shared, versioned artifacts that let each side
work without the other.

Current state when this was written: contract v0.1, `main` protected with required checks
`test` + `typecheck`, 18 backend tests, one working parser (Zeek), SQLite wired but unused.

---

## 1. Three lanes that ship independently

| Lane | Owner | Input | Output | Blocked by |
|---|---|---|---|---|
| **Data in** | Threat intel | raw logs (Zeek, Suricata, syslog, CSV) | `SecurityEvent` objects | nothing |
| **Data out** | Platform | events | SQLite rows, REST, WebSocket | the contract only |
| **Data shown** | Design | events (mock or real) | 3D scene, arcs, HUD | the contract only |

Nobody's lane begins with "wait for the other lane". The contract is the only shared
dependency, and it already exists.

---

## 2. The two seams

### Seam A — the contract, plus fixtures

`docs/api-contract.md` is the written agreement. `contract/*.sample.json` is the executable
part:

```
contract/
  events.sample.json    # realistic SecurityEvents, one per severity
  assets.sample.json    # assets + links, as GET /api/assets returns them
```

Rules of use:

- Backend tests parse these files and assert the produced objects match the same shape.
- Frontend tests feed the same files into the renderer.
- Any change to a field updates **the contract, the fixtures and the consumer** in one PR.

That is the difference between "we think we agree" and "the build proves we agree".

### Seam B — `data/assets.json`

One file, owned by Design, handed over in the first two days:

- Platform seeds the `assets` table from it.
- The 3D scene builds meshes and positions from it.

Without it you will spend week three reconciling two different ideas of what
`asset-egov-portal` is called and where it sits.

---

## 3. Rules that stop blocking

1. **Mock is the plan, not a hack.** The frontend never waits for the API:
   `frontend/src/data/mock.ts` implements the contract; `VITE_API_BASE` flips to the real one.
2. **Stub endpoints exist from day one.** `/api/events` already returns
   `{"events": [], "next_cursor": null}` — the correct shape with no data, so the frontend can
   wire the real URL immediately.
3. **Blocked for more than 30 minutes means you are on the wrong task.** Switch to anything in
   your own zone that does not depend on the blocker, and leave a comment on the issue.
4. **Contract changes are a scheduled 15-minute event**, not a background decision: PR to
   `docs/api-contract.md`, all three approve, then implementation.
5. **Announce before touching a shared file**: `docs/api-contract.md`, `README.md`,
   `Makefile`, `backend/pyproject.toml`, `frontend/package.json`. Everything else has an owner.

---

## 4. Rules that stop merge conflicts

- **Disjoint paths per person** — see `docs/team.md`. Inside `frontend/`, `scene/`, `viz/`,
  `ui/` and `data/` are separate files owned by name.
- **Short-lived branches: merge within two days.** A week-old branch is a merge-conflict
  factory.
- **Rebase daily**, never merge `main` into a feature branch:
  `git pull --rebase origin main`.
- **Small PRs** (< ~400 lines), one approval, squash merge, delete branch.
- **Two people must never edit the same file at the same time.** Split the file or sequence the
  work. The only files this is likely to happen with are listed in rule 3.5 above.

---

## 5. Cadence

| When | What | Output |
|---|---|---|
| Daily, 10 min | what I did / what's next / what blocks me | blockers surface early |
| Wednesday | integration checkpoint: rebase everything, `make up` | the system still works together |
| Friday | 5-minute demo from `main` | proof, not promises |
| Every two weeks | re-plan the backlog | the backlog stays honest |

The Wednesday checkpoint is the one teams skip. It is far cheaper to find an integration gap
mid-week than the night before a demo.

---

## 6. Worktrees — running several agents on one machine

Two agents in one checkout will fight over the current branch. Give each its own worktree:

```bash
git worktree add ../threatscope-platform -b feat/backend-models
git worktree add ../threatscope-ingest   -b feat/ingest-suricata
git worktree list
git worktree remove ../threatscope-platform   # when finished
```

One worktree per agent, one branch per worktree, never two agents on one branch.

---

## 7. Definition of "unblocked"

A task is unblocked when:

- its files are in your zone, or the owner has said "go ahead";
- the shape it consumes already exists in `docs/api-contract.md` (real or mocked);
- you can verify it locally without the other lane being finished.

If any of those is false, the task is blocked — pick something else now, do not start and stall.

---

## 8. Escalation

If a seam needs to change (new field, new endpoint, new asset kind):

1. Open a PR to `docs/api-contract.md` (or `data/assets.json`) describing the change and who
   consumes it.
2. Ping both teammates in the PR. Silence is not approval.
3. Merge after both approve.
4. Only then implement.

A contract change merged without the other two knowing is the single most expensive mistake
this team can make.
