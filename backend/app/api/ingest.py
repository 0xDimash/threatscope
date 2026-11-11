"""Ingestion entry points.

Two ways in, both writing to the same event store:

- ``POST /api/ingest`` — raw text plus the name of a pure adapter (``backend/app/ingest``).
  This is the seam Cyber A plugs new sources into: the API only dispatches by name.
- ``POST /api/ingest/batch`` — already-normalised contract events. The simulator uses this.

Adapters never touch the database; persistence and de-duplication live in
``app.services.repository``. Both handlers broadcast to ``/ws/events`` after storing, which is
why they are ``async``: the database work runs in the threadpool, the fan-out stays on the
event loop.
"""

from __future__ import annotations

from typing import Any, Callable

from fastapi import APIRouter, HTTPException
from starlette.concurrency import run_in_threadpool

from app.api.deps import SessionDep
from app.api.ws import current_state, manager
from app.ingest import zeek
from app.schemas.api import IngestBatchRequest, IngestRequest, IngestResponse
from app.services import repository

router = APIRouter()

#: ``source`` -> adapter. Adapters are pure ``raw_text -> list[SecurityEvent]`` functions.
ADAPTERS: dict[str, Callable[[str], list[dict[str, Any]]]] = {
    "zeek": zeek.parse_notice_log,
}


async def _publish(events: list[dict[str, Any]], fresh: int) -> None:
    """Fan fresh data out to WebSocket clients, then a throttled state frame."""
    if not fresh:
        return
    await manager.broadcast_events(events)
    await manager.maybe_broadcast_state(await run_in_threadpool(current_state))


@router.post("/ingest", response_model=IngestResponse)
async def ingest(request: IngestRequest, session: SessionDep) -> IngestResponse:
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

    fresh = await run_in_threadpool(repository.add_events, session, events)
    stored = await run_in_threadpool(repository.count, session)
    await _publish(events, fresh)
    return IngestResponse(accepted=len(events), stored=stored)


@router.post("/ingest/batch", response_model=IngestResponse)
async def ingest_batch(batch: IngestBatchRequest, session: SessionDep) -> IngestResponse:
    """Accept already-normalised events; duplicates are silently skipped."""
    events = [event.model_dump() for event in batch.events]
    fresh = await run_in_threadpool(repository.add_events, session, events)
    stored = await run_in_threadpool(repository.count, session)
    await _publish(events, fresh)
    return IngestResponse(accepted=len(events), stored=stored)
