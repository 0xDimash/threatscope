"""``GET /api/events``: contract shape, filters, time window and cursor pagination."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from app.core.config import REPO_ROOT

SAMPLE_EVENTS: Path = REPO_ROOT / "contract" / "events.sample.json"


def sample_events() -> list[dict[str, Any]]:
    return json.loads(SAMPLE_EVENTS.read_text(encoding="utf-8"))


def ingest_sample(client: TestClient) -> None:
    response = client.post("/api/ingest/batch", json={"events": sample_events()})
    assert response.status_code == 200


def test_empty_store_returns_an_empty_page(client: TestClient) -> None:
    response = client.get("/api/events")

    assert response.status_code == 200
    assert response.json() == {"events": [], "next_cursor": None}


def test_events_are_newest_first(client: TestClient) -> None:
    ingest_sample(client)

    body = client.get("/api/events").json()

    assert [event["id"] for event in body["events"]] == [
        "01J8Z6K3VQ9F3T0M9W2B7C4D14",
        "01J8Z6K3VQ9F3T0M9W2B7C4D13",
        "01J8Z6K3VQ9F3T0M9W2B7C4D12",
        "01J8Z6K3VQ9F3T0M9W2B7C4D11",
        "01J8Z6K3VQ9F3T0M9W2B7C4D10",
    ]
    assert body["next_cursor"] is None


def test_events_match_the_contract(client: TestClient) -> None:
    ingest_sample(client)

    events = client.get("/api/events").json()["events"]

    assert events
    for event in events:
        assert set(event) == set(sample_events()[0])


def test_filters_are_applied(client: TestClient) -> None:
    ingest_sample(client)

    high = client.get("/api/events", params={"severity": "high"}).json()["events"]
    assert len(high) == 3
    assert {event["severity"] for event in high} == {"high"}

    by_asset = client.get(
        "/api/events", params={"asset_id": "asset-water-scada"}
    ).json()["events"]
    assert {event["dst"]["asset_id"] for event in by_asset} == {"asset-water-scada"}

    by_type = client.get("/api/events", params={"type": "port_scan"}).json()["events"]
    assert [event["id"] for event in by_type] == ["01J8Z6K3VQ9F3T0M9W2B7C4D10"]


def test_from_to_query_parameters_are_accepted(client: TestClient) -> None:
    ingest_sample(client)

    response = client.get(
        "/api/events",
        params={"from": "2026-11-10T09:17:40.900Z", "to": "2026-11-10T09:21:55.320Z"},
    )

    assert response.status_code == 200
    assert [event["id"] for event in response.json()["events"]] == [
        "01J8Z6K3VQ9F3T0M9W2B7C4D14",
        "01J8Z6K3VQ9F3T0M9W2B7C4D13",
        "01J8Z6K3VQ9F3T0M9W2B7C4D12",
    ]


def test_cursor_pagination_returns_every_event_once(client: TestClient) -> None:
    ingest_sample(client)

    seen: list[str] = []
    cursor = None
    while True:
        params: dict[str, Any] = {"limit": 2}
        if cursor is not None:
            params["cursor"] = cursor
        body = client.get("/api/events", params=params).json()
        seen.extend(event["id"] for event in body["events"])
        cursor = body["next_cursor"]
        if cursor is None:
            break

    assert seen == [
        "01J8Z6K3VQ9F3T0M9W2B7C4D14",
        "01J8Z6K3VQ9F3T0M9W2B7C4D13",
        "01J8Z6K3VQ9F3T0M9W2B7C4D12",
        "01J8Z6K3VQ9F3T0M9W2B7C4D11",
        "01J8Z6K3VQ9F3T0M9W2B7C4D10",
    ]


def test_malformed_cursor_is_a_client_error(client: TestClient) -> None:
    response = client.get("/api/events", params={"cursor": "%%%"})

    assert response.status_code == 400


def test_malformed_timestamp_is_a_client_error(client: TestClient) -> None:
    response = client.get("/api/events", params={"from": "not-a-date"})

    assert response.status_code == 400


def test_limit_is_bounded(client: TestClient) -> None:
    assert client.get("/api/events", params={"limit": 0}).status_code == 422
    assert client.get("/api/events", params={"limit": 5000}).status_code == 422
