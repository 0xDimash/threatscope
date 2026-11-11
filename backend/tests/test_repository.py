"""Repository behaviour: storage, de-duplication, filtering, pagination and aggregates."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from app.core.config import REPO_ROOT
from app.models import RiskSnapshot
from app.services import repository

SAMPLE_EVENTS: Path = REPO_ROOT / "contract" / "events.sample.json"
SAMPLE_ASSETS: Path = REPO_ROOT / "contract" / "assets.sample.json"


def sample_events() -> list[dict[str, Any]]:
    return json.loads(SAMPLE_EVENTS.read_text(encoding="utf-8"))


def sample_assets() -> dict[str, Any]:
    return json.loads(SAMPLE_ASSETS.read_text(encoding="utf-8"))


@pytest.fixture()
def stored(session) -> Any:
    repository.add_events(session, sample_events())
    return session


def test_add_events_skips_duplicate_ids(stored) -> None:
    assert repository.count(stored) == 5

    again = repository.add_events(stored, sample_events())

    assert again == 0
    assert repository.count(stored) == 5


def test_count_is_zero_on_an_empty_store(session) -> None:
    assert repository.count(session) == 0


def test_events_are_newest_first(stored) -> None:
    events, next_cursor = repository.query(stored)

    assert [event["id"] for event in events] == [
        "01J8Z6K3VQ9F3T0M9W2B7C4D14",
        "01J8Z6K3VQ9F3T0M9W2B7C4D13",
        "01J8Z6K3VQ9F3T0M9W2B7C4D12",
        "01J8Z6K3VQ9F3T0M9W2B7C4D11",
        "01J8Z6K3VQ9F3T0M9W2B7C4D10",
    ]
    assert next_cursor is None


def test_cursor_pagination_walks_every_event_once(stored) -> None:
    seen: list[str] = []
    cursor = None
    pages = 0

    while True:
        events, cursor = repository.query(stored, limit=2, cursor=cursor)
        seen.extend(event["id"] for event in events)
        pages += 1
        if cursor is None:
            break

    assert pages == 3
    assert seen == [
        "01J8Z6K3VQ9F3T0M9W2B7C4D14",
        "01J8Z6K3VQ9F3T0M9W2B7C4D13",
        "01J8Z6K3VQ9F3T0M9W2B7C4D12",
        "01J8Z6K3VQ9F3T0M9W2B7C4D11",
        "01J8Z6K3VQ9F3T0M9W2B7C4D10",
    ]


def test_filters_by_severity_type_and_destination_asset(stored) -> None:
    high, _ = repository.query(stored, severity="high")
    assert {event["id"] for event in high} == {
        "01J8Z6K3VQ9F3T0M9W2B7C4D11",
        "01J8Z6K3VQ9F3T0M9W2B7C4D12",
        "01J8Z6K3VQ9F3T0M9W2B7C4D13",
    }

    beacons, _ = repository.query(stored, type="c2_beacon")
    assert [event["id"] for event in beacons] == ["01J8Z6K3VQ9F3T0M9W2B7C4D12"]

    scada, _ = repository.query(stored, asset_id="asset-water-scada")
    assert {event["id"] for event in scada} == {
        "01J8Z6K3VQ9F3T0M9W2B7C4D13",
        "01J8Z6K3VQ9F3T0M9W2B7C4D14",
    }


def test_filters_by_time_window(stored) -> None:
    since, _ = repository.query(stored, ts_from="2026-11-10T09:17:40.900Z")
    assert [event["id"] for event in since] == [
        "01J8Z6K3VQ9F3T0M9W2B7C4D14",
        "01J8Z6K3VQ9F3T0M9W2B7C4D13",
        "01J8Z6K3VQ9F3T0M9W2B7C4D12",
    ]

    until, _ = repository.query(stored, ts_to="2026-11-10T09:15:02.115Z")
    assert [event["id"] for event in until] == [
        "01J8Z6K3VQ9F3T0M9W2B7C4D11",
        "01J8Z6K3VQ9F3T0M9W2B7C4D10",
    ]


def test_malformed_cursor_and_timestamp_raise_value_error(stored) -> None:
    with pytest.raises(ValueError):
        repository.query(stored, cursor="not-a-cursor")
    with pytest.raises(ValueError):
        repository.query(stored, ts_from="yesterday")


def test_list_assets_returns_inventory(seeded_assets, session) -> None:
    inventory = sample_assets()

    assets, links = repository.list_assets(session)

    assert assets == inventory["assets"]
    assert links == inventory["links"]


def test_risk_is_none_for_unknown_asset(session) -> None:
    assert repository.get_risk(session, "asset-does-not-exist") is None


def test_risk_defaults_to_zero_state_for_unscored_asset(seeded_assets, session) -> None:
    risk = repository.get_risk(session, "asset-egov-portal")

    assert risk == {
        "asset_id": "asset-egov-portal",
        "risk": 0.0,
        "state": "ok",
        "events_24h": 0,
        "last_event_ts": None,
        "top_types": [],
    }


def test_risk_returns_the_latest_snapshot(seeded_assets, session) -> None:
    session.add_all(
        [
            RiskSnapshot(
                asset_id="asset-water-scada",
                ts="2026-11-10T09:00:00.000Z",
                risk=10.0,
                state="elevated",
                events_24h=2,
                top_types=["port_scan"],
            ),
            RiskSnapshot(
                asset_id="asset-water-scada",
                ts="2026-11-10T10:00:00.000Z",
                risk=91.5,
                state="compromised",
                events_24h=14,
                top_types=["scada_intrusion"],
            ),
        ]
    )
    session.commit()

    risk = repository.get_risk(session, "asset-water-scada")

    assert risk is not None
    assert risk["risk"] == 91.5
    assert risk["state"] == "compromised"
    assert risk["last_event_ts"] == "2026-11-10T10:00:00.000Z"


def test_aggregate_state_folds_events(stored) -> None:
    state = repository.aggregate_state(stored)

    assert state["counts"] == {"info": 0, "low": 1, "medium": 0, "high": 3, "critical": 1}
    assert state["threat_level"] == "severe"
    assert state["compromised_assets"] == 0
    assert state["kill_chain"] == {
        "reconnaissance": 0.0,
        "initial_access": 0.0,
        "c2": 0.0,
        "exploitation": 0.0,
        "lateral_movement": 0.0,
        "impact": 0.0,
    }
    assert state["top_types"] == [
        {"type": "c2_beacon", "count": 1},
        {"type": "credential_attack", "count": 1},
        {"type": "lateral_movement", "count": 1},
        {"type": "port_scan", "count": 1},
        {"type": "scada_intrusion", "count": 1},
    ]


def test_compromised_assets_uses_only_the_latest_snapshot(seeded_assets, session) -> None:
    session.add_all(
        [
            RiskSnapshot(
                asset_id="asset-water-scada",
                ts="2026-11-10T09:00:00.000Z",
                state="compromised",
                risk=80.0,
            ),
            RiskSnapshot(
                asset_id="asset-water-scada",
                ts="2026-11-10T10:00:00.000Z",
                state="ok",
                risk=5.0,
            ),
            RiskSnapshot(
                asset_id="asset-egov-portal",
                ts="2026-11-10T10:00:00.000Z",
                state="compromised",
                risk=70.0,
            ),
        ]
    )
    session.commit()

    state = repository.aggregate_state(session)

    assert state["compromised_assets"] == 1


def test_stored_events_keep_the_contract_shape(stored) -> None:
    events, _ = repository.query(stored)

    expected_keys = set(sample_events()[0])
    for event in events:
        assert set(event) == expected_keys
