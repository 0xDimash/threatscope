"""Ingestion entry points.

Two ways in, both writing to the same event store:

- ``POST /api/ingest`` — raw text plus the name of a pure adapter (``backend/app/ingest``).
  This is the seam Cyber A plugs new sources into: the API only dispatches by name.
- ``POST /api/ingest/batch`` — already-normalised contract events. The simulator uses this.

Adapters never touch the database; persistence and de-duplication live in
``app.services.repository``.
"""

from __future__ import annotations

from typing import Any, Callable

from fastapi import APIRouter, HTTPException

from app.api.deps import SessionDep
from app.ingest import zeek
from app.schemas.api import IngestBatchRequest, IngestRequest, IngestResponse
from app.services import repository

router = APIRouter()

#: ``source`` -> adapter. Adapters are pure ``raw_text -> list[SecurityEvent]`` functions.
ADAPTERS: dict[str, Callable[[str], list[dict[str, Any]]]] = {
    "zeek": zeek.parse_notice_log,
}


@router.post("/ingest", response_model=IngestResponse)
def ingest(request: IngestRequest, session: SessionDep) -> IngestResponse:
    """Parse raw text with the named adapter and store the resulting events."""
    source = request.source.strip().lower()
    adapter = ADAPTERS.get(source)
    if adapter is None:
        known = ", ".join(sorted(ADAPTERS))
        raise HTTPException(
            status_code=400, detail=f"unknown source {source!r}; supported: {known}"
        )

    try:
        events = adapter(request.raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    repository.add_events(session, events)
    return IngestResponse(accepted=len(events), stored=repository.count(session))


@router.post("/ingest/batch", response_model=IngestResponse)
def ingest_batch(
    batch: IngestBatchRequest, session: SessionDep
) -> IngestResponse:
    """Accept already-normalised events; duplicates are silently skipped."""
    events = [event.model_dump() for event in batch.events]
    repository.add_events(session, events)
    return IngestResponse(accepted=len(events), stored=repository.count(session))
