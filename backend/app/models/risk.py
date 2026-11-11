"""``risk_snapshots`` table — one row per asset per scoring pass.

The table is written by the risk engine (phase 3, Cyber A). The API only reads the latest
snapshot, so the scoring rules can change without touching the serving layer.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Float, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.core.types import UtcDateTime, format_iso


class RiskSnapshot(Base):
    __tablename__ = "risk_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    asset_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False
    )
    ts: Mapped[datetime] = mapped_column(UtcDateTime(), nullable=False)
    risk: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    state: Mapped[str] = mapped_column(String(16), nullable=False, default="ok")
    events_24h: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    top_types: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)

    __table_args__ = (Index("ix_risk_snapshots_asset_ts", "asset_id", "ts"),)

    def as_contract(self) -> dict[str, Any]:
        return {
            "asset_id": self.asset_id,
            "risk": self.risk,
            "state": self.state,
            "events_24h": self.events_24h,
            "last_event_ts": format_iso(self.ts) if self.ts is not None else None,
            "top_types": list(self.top_types or []),
        }

    @classmethod
    def empty(cls, asset_id: str) -> dict[str, Any]:
        """Contract-shaped zero state for an asset that has never been scored."""
        return {
            "asset_id": asset_id,
            "risk": 0.0,
            "state": "ok",
            "events_24h": 0,
            "last_event_ts": None,
            "top_types": [],
        }

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<RiskSnapshot {self.asset_id} risk={self.risk}>"
