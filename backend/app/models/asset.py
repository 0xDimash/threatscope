"""City inventory: ``assets`` (nodes) and ``links`` (edges)."""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import JSON, CheckConstraint, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Asset(Base):
    """A node in the 3D city, seeded from ``data/assets.json``."""

    __tablename__ = "assets"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    criticality: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    district: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    #: ``{x, y, z}`` scene coordinates. Owned by the frontend; stored so layouts reproduce.
    position: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    ip: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    tags: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)

    __table_args__ = (
        CheckConstraint("criticality BETWEEN 1 AND 5", name="ck_assets_criticality"),
    )

    def as_contract(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "kind": self.kind,
            "criticality": self.criticality,
            "district": self.district,
            "position": dict(self.position or {}),
            "ip": self.ip,
            "tags": list(self.tags or []),
        }

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Asset {self.id} kind={self.kind}>"


class Link(Base):
    """A directed edge between two assets."""

    __tablename__ = "links"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source: Mapped[str] = mapped_column(
        String(64), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    target: Mapped[str] = mapped_column(
        String(64), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False, default="network")

    def as_contract(self) -> dict[str, Any]:
        return {"source": self.source, "target": self.target, "kind": self.kind}

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Link {self.source}->{self.target}>"
