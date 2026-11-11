"""``GET /api/events`` — contract-shaped events, newest first, cursor paginated."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.api.deps import SessionDep
from app.schemas.api import EventsPage
from app.services import repository

router = APIRouter()


@router.get("/events", response_model=EventsPage)
def list_events(
    session: SessionDep,
    limit: int = Query(100, ge=1, le=1000),
    severity: Optional[str] = Query(None, description="info | low | medium | high | critical"),
    type: Optional[str] = Query(None, description="machine event category"),
    asset_id: Optional[str] = Query(None, description="destination asset id"),
    from_: Optional[str] = Query(None, alias="from", description="inclusive ISO-8601 lower bound"),
    to: Optional[str] = Query(None, description="inclusive ISO-8601 upper bound"),
    cursor: Optional[str] = Query(None, description="``next_cursor`` from the previous page"),
) -> EventsPage:
    """Return a page of stored events.

    ``from`` is a Python keyword, so the query parameter is accepted under its contract name
    through ``alias``. A malformed timestamp or cursor is a client error (400), not a 500.
    """
    try:
        events, next_cursor = repository.query(
            session,
            limit=limit,
            severity=severity,
            type=type,
            asset_id=asset_id,
            ts_from=from_,
            ts_to=to,
            cursor=cursor,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return EventsPage(events=events, next_cursor=next_cursor)
