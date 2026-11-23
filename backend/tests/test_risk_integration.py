"""Risk engine end to end: ingest → snapshots → REST → aggregate → WebSocket."""

from __future__ import annotations

import time
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.ingest.base import iso_utc, make_event


def fresh_event(
    *,
    asset_id: str = "asset-egov-portal",
    ip: str = "10.10.4.21",
    severity: str = "critical",
    event_type: str = "ransomware",
) -> dict[str, Any]:
    return make_event(
        event_type=event_type,
        severity=severity,
        ts=iso_utc(time.time()),
        src={"ip": "203.0.113.9"},
        dst={"ip": ip, "asset_id": asset_id},
        raw_source="test",
    )


def test_ingest_scores_the_target_asset_and_leaves_others_alone(client: TestClient) -> None:
    response = client.post("/api/ingest/batch", json={"events": [fresh_event()]})

    assert response.status_code == 200
    assert response.json() == {"accepted": 1, "stored": 1}

    target = client.get("/api/assets/asset-egov-portal/risk").json()
    untouched = client.get("/api/assets/asset-water-scada/risk").json()

    assert target["risk"] == pytest.approx(25.0 * 1.3)  # critical × criticality-4 weight
    assert target["state"] == "elevated"
    assert target["events_24h"] == 1
    assert target["top_types"] == ["ransomware"]
    assert target["last_event_ts"] is not None

    assert untouched["risk"] == 0.0
    assert untouched["state"] == "ok"
    assert untouched["events_24h"] == 0


def test_repeat_ingests_accumulate_into_a_fresh_snapshot(client: TestClient) -> None:
    for _ in range(2):
        client.post("/api/ingest/batch", json={"events": [fresh_event()]})

    body = client.get("/api/assets/asset-egov-portal/risk").json()

    assert body["risk"] == pytest.approx(2 * 25.0 * 1.3)
    assert body["events_24h"] == 2
    assert body["top_types"] == ["ransomware"]


def test_unknown_asset_risk_is_still_a_404(client: TestClient) -> None:
    assert client.get("/api/assets/asset-does-not-exist/risk").status_code == 404


def test_threat_level_follows_the_scores(client: TestClient) -> None:
    assert client.get("/api/state").json()["threat_level"] == "low"

    client.post(
        "/api/ingest/batch",
        json={"events": [fresh_event(), fresh_event()]},
    )
    after_two = client.get("/api/state").json()
    assert after_two["threat_level"] == "high"  # 65.0, inside the 60..80 band
    assert after_two["counts"]["critical"] == 2

    client.post("/api/ingest/batch", json={"events": [fresh_event()]})
    after_three = client.get("/api/state").json()
    assert after_three["threat_level"] == "severe"  # 97.5
    assert after_three["counts"]["critical"] == 3


def test_ingest_broadcasts_a_risk_frame(client: TestClient) -> None:
    payload = fresh_event()

    with client.websocket_connect("/ws/events") as socket:
        assert socket.receive_json()["kind"] == "state"

        response = client.post("/api/ingest/batch", json={"events": [payload]})
        assert response.status_code == 200

        event_frame = socket.receive_json()
        risk_frame = socket.receive_json()

    assert event_frame["kind"] == "event"
    assert event_frame["data"]["id"] == payload["id"]
    assert risk_frame["kind"] == "risk"
    assert risk_frame["data"]["asset_id"] == "asset-egov-portal"
    assert risk_frame["data"]["risk"] > 0
    assert risk_frame["data"]["events_24h"] == 1
    assert risk_frame["data"]["top_types"] == ["ransomware"]
