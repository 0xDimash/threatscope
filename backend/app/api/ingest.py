from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services import store

router = APIRouter()


class IngestBatch(BaseModel):
    events: list[dict[str, Any]] = Field(default_factory=list)


@router.post("/ingest/batch")
def ingest_batch(batch: IngestBatch) -> dict[str, int]:
    """Phase-1 entry point: accepts already-normalised SecurityEvents.

    Adapters in app/ingest/ will feed this (or the DB writer) in later phases.
    """
    accepted = store.add_events(batch.events)
    return {"accepted": accepted, "stored": store.count()}
