from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Query

from app.services import store

router = APIRouter()


@router.get("/events")
def list_events(
    limit: int = Query(100, ge=1, le=1000),
    severity: Optional[str] = None,
    type: Optional[str] = None,
    asset_id: Optional[str] = None,
) -> dict[str, object]:
    items = store.query(limit=limit, severity=severity, type=type, asset_id=asset_id)
    return {"events": items, "next_cursor": None}
