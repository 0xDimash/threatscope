"""Request and response envelopes for the REST and WebSocket API."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.contract import Asset, Link, SecurityEvent, Space, SpaceComponent, SpaceTemplate


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


def _validate_components(components: list[SpaceComponent]) -> list[SpaceComponent]:
    if len(components) > 64:
        raise ValueError("components must contain at most 64 items")
    seen: set[str] = set()
    for component in components:
        if component.id in seen:
            raise ValueError(f"duplicate component id: {component.id}")
        seen.add(component.id)
    return components


class SpaceCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    #: Optional so clients can keep a stable id; one is generated when omitted.
    id: Optional[str] = Field(default=None, max_length=64, pattern=r"^[A-Za-z0-9._-]+$")
    name: str = Field(min_length=2, max_length=40)
    template: SpaceTemplate
    components: list[SpaceComponent] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def _trim_name(cls, value: str) -> str:
        name = value.strip()
        if len(name) < 2 or len(name) > 40:
            raise ValueError("name must be 2..40 characters after trimming")
        return name

    @field_validator("components")
    @classmethod
    def _components(cls, value: list[SpaceComponent]) -> list[SpaceComponent]:
        return _validate_components(value)


class SpaceUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=2, max_length=40)
    components: list[SpaceComponent] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def _trim_name(cls, value: str) -> str:
        name = value.strip()
        if len(name) < 2 or len(name) > 40:
            raise ValueError("name must be 2..40 characters after trimming")
        return name

    @field_validator("components")
    @classmethod
    def _components(cls, value: list[SpaceComponent]) -> list[SpaceComponent]:
        return _validate_components(value)


class SpacesResponse(BaseModel):
    spaces: list[Space]


__all__ = [
    "AssetsResponse",
    "EventsPage",
    "IngestBatchRequest",
    "IngestRequest",
    "IngestResponse",
    "SpaceCreateRequest",
    "SpaceUpdateRequest",
    "SpacesResponse",
    "WsFrame",
]
