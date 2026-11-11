"""SQLAlchemy models for the event store.

Tables follow ``docs/architecture.md``: ``assets``, ``links``, ``events``, ``risk_snapshots``.
``incidents`` arrives with the correlation engine (phase 3, Cyber A).

Every model exposes ``as_contract()`` returning the exact dict shape from
``docs/api-contract.md``, so API code never hand-assembles contract fields.
"""

from __future__ import annotations

from app.models.asset import Asset, Link
from app.models.event import Event
from app.models.risk import RiskSnapshot

__all__ = ["Asset", "Link", "Event", "RiskSnapshot"]
