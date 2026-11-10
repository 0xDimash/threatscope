from __future__ import annotations

from collections import deque
from typing import Any, Optional

_MAX_EVENTS = 10_000

_events: deque[dict[str, Any]] = deque(maxlen=_MAX_EVENTS)


def add_events(items: list[dict[str, Any]]) -> int:
    _events.extendleft(reversed(items))
    return len(items)


def query(
    limit: int = 100,
    severity: Optional[str] = None,
    type: Optional[str] = None,
    asset_id: Optional[str] = None,
) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for event in _events:
        if severity and event.get("severity") != severity:
            continue
        if type and event.get("type") != type:
            continue
        if asset_id and (event.get("dst") or {}).get("asset_id") != asset_id:
            continue
        result.append(event)
        if len(result) >= limit:
            break
    return result


def count() -> int:
    return len(_events)
