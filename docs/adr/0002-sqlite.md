# ADR 0002 — SQLite instead of PostgreSQL/TimescaleDB

- **Status:** accepted
- **Date:** 2026-11-10
- **Supersedes:** the DB row of [`0001-stack.md`](0001-stack.md)

## Context

ADR-0001 chose PostgreSQL + TimescaleDB for the asset inventory and the event time series.
Since then the deployment target clarified: a diploma demo, run by one analyst, with a single
ingest process, on a laptop or a single machine. The event volume is thousands to low hundreds
of thousands of rows per scenario, not millions per second.

Postgres brought costs that do not pay for themselves here: a container to keep healthy, an ARM
image pin for Apple Silicon, connection strings to explain to two teammates, and a dump/restore
step every time the demo dataset has to move machines.

## Decision

Use **SQLite**, keeping **SQLAlchemy + Alembic** unchanged.

- Default URL: `sqlite+pysqlite:///./data/threatscope.db`
- WAL mode, `synchronous=NORMAL`, `foreign_keys=ON` on every connection.
- Index `events(ts)` and `events(dst_asset_id)`; no hypertables, no continuous aggregates.
- The database file lives in `backend/data/` (gitignored). Copying the file reproduces a demo
  scenario exactly.

## Portability rules (so Postgres stays a config change)

- Portable column types only: `String`, `Integer`, `Float`, `Boolean`, `DateTime(timezone=True)`,
  `JSON`. No `JSONB`, `ARRAY`, `UUID`, or Postgres-specific defaults.
- Alembic migrations only — never hand-edited schema.
- Batch inserts inside one transaction; never one insert per event.
- UTC everywhere; all filtering is `ts BETWEEN` ranges.

## Consequences

- One less moving part in Docker: `docker-compose.yml` no longer has a `db` service.
- `make reset-db` deletes and recreates the file in one second.
- Writes are serialised by design — correct for one ingest worker, wrong for many. If the project
  ever needs concurrent writers or multi-user access, switch by changing `DATABASE_URL`.
- Thesis note: this is a deliberate scope decision, not a missing feature. State the expected
  volume and the single-writer model in the evaluation chapter.

## Revisit if

- More than one process must write concurrently.
- Event volume makes a single-file index scan the bottleneck.
- The demo needs to be served to several simultaneous users over a network.
