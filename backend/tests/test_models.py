"""The ORM layer must round-trip the contract without losing or reshaping a field."""

from __future__ import annotations

import json
from datetime import timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import inspect

from app.core.config import REPO_ROOT
from app.core.db import engine
from app.models import Event

EVENTS_FIXTURE: Path = REPO_ROOT / "contract" / "events.sample.json"


def sample_events() -> list[dict[str, Any]]:
    return json.loads(EVENTS_FIXTURE.read_text(encoding="utf-8"))


def test_sample_events_round_trip_exactly(session) -> None:
    events = sample_events()
    session.add_all(Event.from_contract(payload) for payload in events)
    session.commit()
    session.expire_all()

    stored = {row.id: row.as_contract() for row in session.query(Event).all()}

    assert len(stored) == len(events)
    for payload in events:
        assert stored[payload["id"]] == payload


def test_timestamps_are_timezone_aware_utc(session) -> None:
    payload = sample_events()[0]
    session.add(Event.from_contract(payload))
    session.commit()
    session.expire_all()

    stored = session.get(Event, payload["id"])
    assert stored is not None
    assert stored.ts.tzinfo is not None
    assert stored.ts.utcoffset() == timedelta(0)


def test_contract_indexes_exist(session) -> None:
    inspector = inspect(engine)
    indexes = {item["name"] for item in inspector.get_indexes("events")}

    assert {"ix_events_ts", "ix_events_dst_asset_id"} <= indexes


def test_unknown_severity_degrades_to_info() -> None:
    from app.schemas.contract import SecurityEvent

    event = SecurityEvent.model_validate(
        {"id": "x", "ts": "2026-11-10T00:00:00.000Z", "type": "other", "severity": "catastrophic"}
    )

    assert event.severity == "info"
