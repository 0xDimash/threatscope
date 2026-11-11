"""Request and response envelopes for the REST and WebSocket API."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.contract import Asset, Link, SecurityEvent


class EventsPage(BaseModel):
    events: list[SecurityEvent]
    next_cursor: Optional[str] = None


class AssetsResponse(BaseModel):
    assets: list[Asset]
    links: list[Link]


class IngestRequest(BaseModel):
    """``POST /api/ingest`` — raw text handed to the adapter named by ``source``."""

    source: str = Field(min_length=1, max_length=48)
    raw: str


class IngestBatchRequest(BaseModel):
    """``POST /api/ingest/batch`` — already-normalised events (simulator path)."""

    events: list[SecurityEvent] = Field(default_factory=list)


class IngestResponse(BaseModel):
    accepted: int
    stored: int


class WsFrame(BaseModel):
    """Server -> client frame: ``{kind, data}`` per the contract."""

    kind: Literal["event", "state", "risk"]
    data: Any


__all__ = [
    "AssetsResponse",
    "EventsPage",
    "IngestBatchRequest",
    "IngestRequest",
    "IngestResponse",
    "WsFrame",
]
