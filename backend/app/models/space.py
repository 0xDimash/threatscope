"""`spaces` table — persistent room layouts.

A space is a named layout of placed devices. Components are stored as JSON because the
frontend owns coordinates and the shape is small and contract-defined. `asset_id` has no
foreign key: layouts must survive inventory reseeds.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.core.types import UtcDateTime, format_iso


class Space(Base):
    __tablename__ = "spaces"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(40), nullable=False)
    template: Mapped[str] = mapped_column(String(32), nullable=False)
    components: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(
        UtcDateTime(), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        UtcDateTime(),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def as_contract(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "template": self.template,
            "components": [dict(component) for component in (self.components or [])],
            "created_at": format_iso(self.created_at),
            "updated_at": format_iso(self.updated_at),
        }

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Space {self.id} template={self.template}>"
