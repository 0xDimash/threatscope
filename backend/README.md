# Backend — ThreatScope 3D

FastAPI + SQLAlchemy + SQLite (WAL).

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000   # http://localhost:8000/docs
pytest
ruff check .
```

## Layout

| Dir | Responsibility | Owner |
|---|---|---|
| `app/api/` | routers, request/response schemas | Cyber B |
| `app/core/` | config, security, auth | Cyber B |
| `app/models/` | SQLAlchemy tables | Cyber B |
| `app/core/db.py` | engine, session, SQLite pragmas | Cyber B |
| `app/schemas/` | Pydantic DTOs shared with API | Cyber B |
| `app/ingest/` | adapters: raw log → `SecurityEvent` | Cyber A |
| `app/services/` | enrichment, risk engine, correlation | Cyber A |

Adapters are pure functions (`raw -> Iterable[SecurityEvent]`) so they can be unit-tested
against fixture files with no DB or network.
