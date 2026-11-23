"""Database-backed repository for the API layer.

``app/services/store.py`` kept events in a process-local ``deque``. This module replaces it
with real persistence while keeping the same call shapes (``add_events``, ``query``, ``count``).
``store.py`` is deliberately left alone: ``backend/app/services`` is Cyber A's zone.

Nothing here decides *what* an event means — severity and MITRE mapping live in the ingest
adapters, and the risk arithmetic lives in ``app.services.risk``. This module only stores,
retrieves and coordinates what the contract describes.
"""

from __future__ import annotations

import base64
import binascii
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.core.types import format_iso, parse_iso
from app.models import Asset, Event, Link, RiskSnapshot
from app.schemas.contract import KILL_CHAIN_STAGES, SEVERITIES
from app.services import risk
from app.services.mapping import apply_mapping

#: Upper bounds for the city-wide threat level, derived from the highest asset score.
#: Bands are evenly spaced across the contract's 0..100 scale; the last one is ``severe``.
_THREAT_BY_RISK: tuple[tuple[float, str], ...] = (
    (20.0, "low"),
    (40.0, "guarded"),
    (60.0, "elevated"),
    (80.0, "high"),
)

TOP_TYPES_LIMIT = 5


@dataclass(frozen=True)
class IngestResult:
    """What an ingest batch changed: how many events were stored and which scores moved."""

    stored: int
    #: Contract ``RiskState`` dicts for assets whose score changed, ready for a ``risk`` frame.
    risks: list[dict[str, Any]] = field(default_factory=list)


def add_events(session: Session, items: Iterable[dict[str, Any]]) -> int:
    """Persist events and return how many were newly stored; keeps the old call shape."""
    return ingest_events(session, items).stored


def ingest_events(session: Session, items: Iterable[dict[str, Any]]) -> IngestResult:
    """Persist contract-shaped events, rescore the touched assets, and return the result.

    Duplicate ids are skipped rather than raising: replaying a capture or a simulator run
    must be safe. The contract forbids reusing an ``id``, so an existing id means "seen it".

    Endpoints are mapped to inventory assets here, once, so adapters stay pure and every
    source gets the same treatment (``app.services.mapping``). A single scoring pass then
    updates the snapshots of every destination asset in the batch — never one query per
    event, and never a full re-score of the city.
    """
    rows = [Event.from_contract(item) for item in apply_mapping(session, items)]
    if not rows:
        return IngestResult(stored=0)

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
    # Flush so the scoring query sees this batch without committing a half-written ingest.
    session.flush()
    touched = {row.dst_asset_id for row in fresh if row.dst_asset_id}
    changed = _score_assets(session, touched)
    session.commit()
    return IngestResult(stored=len(fresh), risks=changed)


def _score_assets(session: Session, asset_ids: set[str]) -> list[dict[str, Any]]:
    """Write one snapshot per touched asset and return the ones whose score changed.

    Three queries for the whole batch regardless of size: criticalities, the events inside the
    window, and the previously latest snapshot per asset.
    """
    if not asset_ids:
        return []

    now = datetime.now(timezone.utc)
    criticality = dict(
        session.execute(
            select(Asset.id, Asset.criticality).where(Asset.id.in_(asset_ids))
        ).all()
    )
    known = set(criticality)
    if not known:
        # An explicit asset_id that is not in the inventory: store the event, score nothing.
        return []

    window_start = now - timedelta(hours=risk.WINDOW_HOURS)
    events: dict[str, list[Event]] = {asset_id: [] for asset_id in known}
    for event in session.scalars(
        select(Event).where(
            Event.dst_asset_id.in_(known),
            Event.ts >= window_start,
        )
    ):
        asset_id = event.dst_asset_id
        if asset_id is not None:
            events[asset_id].append(event)

    latest_ids = (
        select(func.max(RiskSnapshot.id))
        .where(RiskSnapshot.asset_id.in_(known))
        .group_by(RiskSnapshot.asset_id)
        .scalar_subquery()
    )
    previous = {
        snapshot.asset_id: snapshot.risk
        for snapshot in session.scalars(
            select(RiskSnapshot).where(RiskSnapshot.id.in_(latest_ids))
        )
    }

    changed: list[dict[str, Any]] = []
    for asset_id in sorted(known):
        summary = risk.assess(events[asset_id], criticality[asset_id], now=now)
        snapshot = RiskSnapshot(
            asset_id=asset_id,
            ts=now,
            risk=summary.risk,
            state=summary.state,
            events_24h=summary.events_24h,
            top_types=summary.top_types,
        )
        session.add(snapshot)

        before = previous.get(asset_id)
        if before is None or abs(before - summary.risk) > 1e-9:
            changed.append(snapshot.as_contract())
    return changed


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


def _latest_snapshots(session: Session) -> list[tuple[float, str]]:
    """Risk and state of the newest snapshot per asset, as ``(risk, state)`` pairs."""
    latest_ids = (
        select(func.max(RiskSnapshot.id))
        .group_by(RiskSnapshot.asset_id)
        .scalar_subquery()
    )
    return [
        (float(score), state)
        for score, state in session.execute(
            select(RiskSnapshot.risk, RiskSnapshot.state).where(
                RiskSnapshot.id.in_(latest_ids)
            )
        ).all()
    ]


def _threat_level(risks: Iterable[float]) -> str:
    """City-wide level from the highest asset score, not from the worst single event.

    Scores decay, so the banner can go back down after a quiet period — that is the point of
    deriving it from the risk model rather than from "a critical event happened once".
    """
    peak = max(risks, default=0.0)
    for bound, level in _THREAT_BY_RISK:
        if peak < bound:
            return level
    return "severe"


def aggregate_state(session: Session) -> dict[str, Any]:
    """City-wide aggregate for ``GET /api/state``.

    ``threat_level`` and ``compromised_assets`` come from the latest per-asset snapshots;
    ``counts`` and ``top_types`` remain straight folds over the event store. ``kill_chain``
    stays zeroed until the correlation engine lands.
    """
    counts = _counts_by_severity(session)
    top_types = session.execute(
        select(Event.type, func.count(Event.id).label("total"))
        .group_by(Event.type)
        .order_by(func.count(Event.id).desc(), Event.type)
        .limit(TOP_TYPES_LIMIT)
    ).all()
    snapshots = _latest_snapshots(session)

    return {
        "threat_level": _threat_level(score for score, _ in snapshots),
        "counts": counts,
        "compromised_assets": sum(1 for _, state in snapshots if state == "compromised"),
        "kill_chain": {stage: 0.0 for stage in KILL_CHAIN_STAGES},
        "top_types": [{"type": event_type, "count": int(total)} for event_type, total in top_types],
    }
