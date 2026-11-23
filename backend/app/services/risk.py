"""Per-asset risk scoring — pure functions, no database access.

The repository loads the events for an asset and calls :func:`assess`; this module decides
what they mean. Keeping the arithmetic here means the model can be unit-tested without a
database and changed without touching persistence or the API.

The model, in one line::

    risk = min(100, Σ risk_delta × weight(criticality) × decay(age))

over the last 24 hours of wall-clock time, with a 6-hour half-life. Constants and thresholds
are documented in ``docs/threat-model.md`` and are deliberately boring: the thesis needs a
rule it can defend, not a tuned black box.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional, Protocol

from app.core.types import parse_iso

#: Events older than this many hours do not contribute to the score.
WINDOW_HOURS = 24.0

#: Contribution halves every this many hours.
HALF_LIFE_HOURS = 6.0

#: ``weight(criticality) = CRITICALITY_BASE + criticality / CRITICALITY_STEP``.
#: With the contract's 1..5 range this gives 0.7 for a low-value node and 1.5 for a crown jewel.
CRITICALITY_BASE = 0.5
CRITICALITY_STEP = 5.0

#: The contract's risk scale is 0..100.
MAX_RISK = 100.0

#: How many event types the snapshot keeps, most frequent first.
TOP_TYPES_LIMIT = 3

#: Upper bounds for each state, in contract order. Anything at or above the last bound is
#: ``compromised`` (the contract's ``RiskStateName`` is ok | elevated | critical | compromised).
STATE_THRESHOLDS: tuple[tuple[float, str], ...] = (
    (20.0, "ok"),
    (50.0, "elevated"),
    (80.0, "critical"),
)


class EventLike(Protocol):
    """The fields the scoring pass needs; ``app.models.Event`` satisfies this."""

    ts: datetime
    type: str
    risk_delta: Optional[float]


@dataclass(frozen=True)
class AssetRisk:
    """Everything a ``risk_snapshots`` row needs, computed in one pass."""

    risk: float
    state: str
    events_24h: int
    top_types: list[str] = field(default_factory=list)


def criticality_weight(criticality: int) -> float:
    """Multiply how much an event hurts by how much the asset is worth.

    ``0.5 + criticality / 5``: criticality 1 → 0.7, 3 → 1.1, 5 → 1.5. Out-of-range values are
    clamped to the contract's 1..5 range so a bad inventory row cannot invent a multiplier.
    """
    bounded = max(1, min(5, int(criticality)))
    return CRITICALITY_BASE + bounded / CRITICALITY_STEP


def decay(age_hours: float) -> float:
    """Exponential decay with a six-hour half-life: age 0 → 1.0, 6 h → 0.5, 12 h → 0.25."""
    if age_hours <= 0:
        return 1.0
    return 0.5 ** (age_hours / HALF_LIFE_HOURS)


def state_for(risk: float) -> str:
    """Map a 0..100 score to the contract's ``RiskStateName``."""
    for bound, name in STATE_THRESHOLDS:
        if risk < bound:
            return name
    return "compromised"


def score(
    events: list[EventLike], criticality: int, *, now: datetime
) -> tuple[float, str]:
    """Return ``(risk, state)`` for one asset.

    ``now`` is explicit so tests and replays are deterministic; callers pass the wall-clock
    moment of the scoring pass.
    """
    summary = assess(events, criticality, now=now)
    return summary.risk, summary.state


def assess(events: list[EventLike], criticality: int, *, now: datetime) -> AssetRisk:
    """Score one asset and summarise the window for its snapshot.

    Events outside the 24-hour window are ignored entirely — they are neither scored nor
    counted in ``events_24h``. A future timestamp is treated as age zero: a slightly fast
    source clock must not make an event contribute more than its ``risk_delta`` allows.
    """
    moment = _as_utc(now)
    weight = criticality_weight(criticality)

    total = 0.0
    counted = 0
    types: Counter[str] = Counter()

    for event in events:
        age_hours = (moment - _as_utc(event.ts)).total_seconds() / 3600.0
        if age_hours > WINDOW_HOURS:
            continue
        if age_hours < 0:
            age_hours = 0.0

        delta = float(event.risk_delta or 0.0)
        if delta == 0.0:
            # ``info`` events are timeline context, not risk. Counting them in events_24h is
            # useful (the card shows traffic), but they cannot move the score.
            counted += 1
            types[event.type] += 1
            continue

        total += max(0.0, delta) * weight * decay(age_hours)
        counted += 1
        types[event.type] += 1

    risk = round(min(MAX_RISK, total), 2)
    top_types = [name for name, _ in sorted(types.items(), key=lambda item: (-item[1], item[0]))]
    return AssetRisk(
        risk=risk,
        state=state_for(risk),
        events_24h=counted,
        top_types=top_types[:TOP_TYPES_LIMIT],
    )


def _as_utc(value: Any) -> datetime:
    """Accept UTC-aware datetimes, naive ones from SQLite, or a contract ISO string.

    After ``flush()`` SQLAlchemy still holds the string the caller passed to ``Event.ts``;
    after a reload it is a datetime. Both mean the same moment.
    """
    if isinstance(value, str):
        return parse_iso(value)
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
