"""Contract-shaped helpers shared by ingest adapters.

Adapters are pure functions ``raw -> Iterable[SecurityEvent]`` (see
``docs/architecture.md``): they never touch the database or the network. Keeping the
``SecurityEvent`` skeleton here means each adapter only owns source-specific parsing.

Field rules follow ``docs/api-contract.md``: every key is always present, unknown values
are ``None`` (never absent, never ``""``), timestamps are ISO-8601 UTC strings.
"""

from __future__ import annotations

import os
import time
from datetime import datetime, timezone
from typing import Any, Optional

Severity = str

SEVERITIES: tuple[Severity, ...] = ("info", "low", "medium", "high", "critical")

#: Every key a normalised event must carry, in contract order.
CONTRACT_KEYS: tuple[str, ...] = (
    "id",
    "ts",
    "type",
    "severity",
    "src",
    "dst",
    "description",
    "mitre",
    "risk_delta",
    "raw_source",
    "meta",
)

#: How much an event of a given severity moves the destination asset's risk (0..100).
#: Consumed by the risk engine in ``app/services`` and mirrored in ``docs/threat-model.md``.
RISK_DELTA: dict[Severity, float] = {
    "info": 0.0,
    "low": 1.0,
    "medium": 4.0,
    "high": 10.0,
    "critical": 25.0,
}

_CROCKFORD32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def risk_delta_for(severity: Severity) -> float:
    """Risk contribution for ``severity``; unknown severities degrade to ``info``."""
    return RISK_DELTA.get(severity, RISK_DELTA["info"])


def iso_utc(epoch: float) -> str:
    """Format a UNIX timestamp as an ISO-8601 UTC string, e.g. ``2026-11-10T09:14:22.481Z``."""
    moment = datetime.fromtimestamp(epoch, tz=timezone.utc)
    return moment.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def new_ulid(epoch: Optional[float] = None) -> str:
    """Return a 26-character ULID: 48-bit epoch milliseconds + 80 random bits.

    Lexicographic order matches creation order at millisecond resolution, which is all the
    contract needs (``id`` is stable and sortable, never reused).
    """
    milliseconds = int((time.time() if epoch is None else epoch) * 1000)
    value = (milliseconds << 80) | int.from_bytes(os.urandom(10), "big")
    chars = ["0"] * 26
    for index in range(25, -1, -1):
        chars[index] = _CROCKFORD32[value & 0b11111]
        value >>= 5
    return "".join(chars)


def make_event(
    *,
    event_type: str,
    severity: Severity,
    ts: str,
    src: Optional[dict[str, Any]] = None,
    dst: Optional[dict[str, Any]] = None,
    description: Optional[str] = None,
    raw_source: str,
    mitre: Optional[dict[str, Any]] = None,
    risk_delta: Optional[float] = None,
    meta: Optional[dict[str, Any]] = None,
    event_id: Optional[str] = None,
) -> dict[str, Any]:
    """Build a complete ``SecurityEvent`` dict with every contract key present."""
    source = src or {}
    destination = dst or {}
    return {
        "id": event_id if event_id is not None else new_ulid(),
        "ts": ts,
        "type": event_type,
        "severity": severity,
        "src": {
            "ip": source.get("ip"),
            "host": source.get("host"),
            "asset_id": source.get("asset_id"),
        },
        "dst": {
            "ip": destination.get("ip"),
            "host": destination.get("host"),
            "asset_id": destination.get("asset_id"),
        },
        "description": description,
        "mitre": mitre,
        "risk_delta": risk_delta if risk_delta is not None else risk_delta_for(severity),
        "raw_source": raw_source,
        "meta": meta if meta is not None else {},
    }
