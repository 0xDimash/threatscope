"""Database-backed repository for the API layer.

``app/services/store.py`` kept events in a process-local ``deque``. This module replaces it
with real persistence while keeping the same call shapes (``add_events``, ``query``, ``count``).
``store.py`` is deliberately left alone: ``backend/app/services`` is Cyber A's zone.

Nothing here decides *what* an event means — severity, MITRE mapping and scoring stay in the
services layer (Cyber A). This module only stores and retrieves what the contract describes.
"""

from __future__ import annotations

import base64
import binascii
from collections.abc import Iterable
from typing import Any, Optional

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.core.types import format_iso, parse_iso
from app.models import Asset, Event, Link, RiskSnapshot
from app.schemas.contract import KILL_CHAIN_STAGES, SEVERITIES

#: Provisional mapping from the worst severity present to the city-wide threat level.
#: The risk engine (phase 3) will replace this with a score-driven level.
_THREAT_BY_SEVERITY: tuple[tuple[str, str], ...] = (
    ("critical", "severe"),
    ("high", "high"),
    ("medium", "elevated"),
    ("low", "guarded"),
)

TOP_TYPES_LIMIT = 5


def add_events(session: Session, items: Iterable[dict[str, Any]]) -> int:
    """Persist contract-shaped events and return how many were newly stored.

    Duplicate ids are skipped rather than raising: replaying a capture or a simulator run
    must be safe. The contract forbids reusing an ``id``, so an existing id means "seen it".
    """
    rows = [Event.from_contract(item) for item in items]
    if not rows:
        return 0

    ids = [row.id for row in rows]
    existing = set(session.scalars(select(Event.id).where(Event.id.in_(ids))).all())

    fresh: list[Event] = []
    seen: set[str] = set()
    for row in rows:
        if row.id in existing or row.id in seen:
            continue
        seen.add(row.id)
        fresh.append(row)

    session.add_all(fresh)
    session.commit()
    return len(fresh)


def count(session: Session) -> int:
    """Total number of stored events."""
    return session.scalar(select(func.count()).select_from(Event)) or 0


def _encode_cursor(event: Event) -> str:
    raw = f"{format_iso(event.ts)}|{event.id}"
    return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii").rstrip("=")


def _decode_cursor(cursor: str) -> tuple[str, str]:
    padded = cursor + "=" * (-len(cursor) % 4)
    try:
        raw = base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError, ValueError) as exc:
        raise ValueError(f"malformed cursor: {cursor!r}") from exc
    timestamp, separator, event_id = raw.partition("|")
    if not separator or not timestamp or not event_id:
        raise ValueError(f"malformed cursor: {cursor!r}")
    return timestamp, event_id


def query(
    session: Session,
    *,
    limit: int = 100,
    severity: Optional[str] = None,
    type: Optional[str] = None,
    asset_id: Optional[str] = None,
    ts_from: Optional[str] = None,
    ts_to: Optional[str] = None,
    cursor: Optional[str] = None,
) -> tuple[list[dict[str, Any]], Optional[str]]:
    """Return ``(events, next_cursor)`` newest first.

    ``asset_id`` matches the destination asset, which is what the risk model scores; source
    filtering can be added as an additive contract change if the UI needs it.

    Raises ``ValueError`` when a timestamp or the cursor cannot be decoded — the API turns
    that into a 400 instead of a 500.
    """
    statement = select(Event)

    if severity:
        statement = statement.where(Event.severity == severity)
    if type:
        statement = statement.where(Event.type == type)
    if asset_id:
        statement = statement.where(Event.dst_asset_id == asset_id)
    if ts_from:
        statement = statement.where(Event.ts >= parse_iso(ts_from))
    if ts_to:
        statement = statement.where(Event.ts <= parse_iso(ts_to))
    if cursor:
        cursor_ts, cursor_id = _decode_cursor(cursor)
        moment = parse_iso(cursor_ts)
        statement = statement.where(
            or_(
                Event.ts < moment,
                and_(Event.ts == moment, Event.id < cursor_id),
            )
        )

    statement = statement.order_by(Event.ts.desc(), Event.id.desc()).limit(limit + 1)
    rows = list(session.scalars(statement).all())

    has_more = len(rows) > limit
    page = rows[:limit]
    next_cursor = _encode_cursor(page[-1]) if has_more and page else None
    return [row.as_contract() for row in page], next_cursor


def list_assets(session: Session) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Return ``(assets, links)`` for ``GET /api/assets``."""
    assets = session.scalars(select(Asset).order_by(Asset.id)).all()
    links = session.scalars(select(Link).order_by(Link.id)).all()
    return [asset.as_contract() for asset in assets], [link.as_contract() for link in links]


def get_risk(session: Session, asset_id: str) -> Optional[dict[str, Any]]:
    """Latest risk snapshot for ``asset_id``, or ``None`` if the asset does not exist.

    An asset that exists but was never scored returns a zero state, so the UI can render it
    without special-casing ``null``.
    """
    if session.get(Asset, asset_id) is None:
        return None
    snapshot = session.scalars(
        select(RiskSnapshot)
        .where(RiskSnapshot.asset_id == asset_id)
        .order_by(RiskSnapshot.ts.desc(), RiskSnapshot.id.desc())
        .limit(1)
    ).first()
    return snapshot.as_contract() if snapshot is not None else RiskSnapshot.empty(asset_id)


def _counts_by_severity(session: Session) -> dict[str, int]:
    counts = {severity: 0 for severity in SEVERITIES}
    rows = session.execute(
        select(Event.severity, func.count(Event.id)).group_by(Event.severity)
    ).all()
    for severity, total in rows:
        if severity in counts:
            counts[severity] = int(total)
    return counts


def _compromised_assets(session: Session) -> int:
    latest_ids = (
        select(func.max(RiskSnapshot.id))
        .group_by(RiskSnapshot.asset_id)
        .scalar_subquery()
    )
    total = session.scalar(
        select(func.count())
        .select_from(RiskSnapshot)
        .where(RiskSnapshot.id.in_(latest_ids), RiskSnapshot.state == "compromised")
    )
    return int(total or 0)


def _threat_level(counts: dict[str, int]) -> str:
    for severity, level in _THREAT_BY_SEVERITY:
        if counts.get(severity, 0) > 0:
            return level
    return "low"


def aggregate_state(session: Session) -> dict[str, Any]:
    """City-wide aggregate for ``GET /api/state``.

    ``kill_chain`` stays zeroed until the correlation engine lands; everything else is a
    straight fold over the event store.
    """
    counts = _counts_by_severity(session)
    top_types = session.execute(
        select(Event.type, func.count(Event.id).label("total"))
        .group_by(Event.type)
        .order_by(func.count(Event.id).desc(), Event.type)
        .limit(TOP_TYPES_LIMIT)
    ).all()

    return {
        "threat_level": _threat_level(counts),
        "counts": counts,
        "compromised_assets": _compromised_assets(session),
        "kill_chain": {stage: 0.0 for stage in KILL_CHAIN_STAGES},
        "top_types": [{"type": event_type, "count": int(total)} for event_type, total in top_types],
    }
