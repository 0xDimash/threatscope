"""``events`` table — one row per normalised ``SecurityEvent``."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import JSON, Float, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.core.types import UtcDateTime, format_iso


class Event(Base):
    """A stored security event.

    The nested ``src``/``dst``/``mitre`` objects from the contract are flattened into
    columns so queries can filter and index on ``dst_asset_id`` without parsing JSON.
    """

    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    ts: Mapped[datetime] = mapped_column(UtcDateTime(), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(48), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(String(16), nullable=False, index=True)

    src_ip: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    src_host: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    src_asset_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    dst_ip: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    dst_host: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    dst_asset_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)

    description: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    mitre: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    risk_delta: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    raw_source: Mapped[str] = mapped_column(String(48), nullable=False)
    meta: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    def as_contract(self) -> dict[str, Any]:
        """Return the event exactly as ``docs/api-contract.md`` describes it."""
        return {
            "id": self.id,
            "ts": format_iso(self.ts),
            "type": self.type,
            "severity": self.severity,
            "src": {
                "ip": self.src_ip,
                "host": self.src_host,
                "asset_id": self.src_asset_id,
            },
            "dst": {
                "ip": self.dst_ip,
                "host": self.dst_host,
                "asset_id": self.dst_asset_id,
            },
            "description": self.description,
            "mitre": dict(self.mitre) if self.mitre is not None else None,
            "risk_delta": self.risk_delta,
            "raw_source": self.raw_source,
            "meta": dict(self.meta or {}),
        }

    @classmethod
    def from_contract(cls, payload: dict[str, Any]) -> Event:
        """Build a row from a contract-shaped dict (adapters and ``/api/ingest/*``)."""
        source = payload.get("src") or {}
        destination = payload.get("dst") or {}
        return cls(
            id=payload["id"],
            ts=payload["ts"],
            type=payload.get("type") or "other",
            severity=payload.get("severity") or "info",
            src_ip=source.get("ip"),
            src_host=source.get("host"),
            src_asset_id=source.get("asset_id"),
            dst_ip=destination.get("ip"),
            dst_host=destination.get("host"),
            dst_asset_id=destination.get("asset_id"),
            description=payload.get("description"),
            mitre=payload.get("mitre"),
            risk_delta=payload.get("risk_delta"),
            raw_source=payload.get("raw_source") or "unknown",
            meta=payload.get("meta") or {},
        )

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Event {self.id} {self.severity} {self.type}>"
