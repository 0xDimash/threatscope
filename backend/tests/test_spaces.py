"""`/api/spaces` — persistent layouts and per-component risk."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi.testclient import TestClient

from app.core.seed import ROOM_SPACE_COMPONENTS, ROOM_SPACE_ID


def _space_payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": "Lab A",
        "template": "room",
        "components": [
            {
                "id": "c1",
                "kind": "rack",
                "x": 1.5,
                "z": -2.0,
                "asset_id": "asset-municipal-dc",
            },
            {"id": "c2", "kind": "pc", "x": 0.0, "z": 1.0, "asset_id": None},
        ],
    }
    payload.update(overrides)
    return payload


def test_seeded_room_space_exists(client: TestClient) -> None:
    response = client.get(f"/api/spaces/{ROOM_SPACE_ID}")
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == ROOM_SPACE_ID
    assert body["template"] == "room"
    assert len(body["components"]) == 8
    pairs = {(c["id"], c["asset_id"]) for c in body["components"]}
    expected = {(c["id"], c["asset_id"]) for c in ROOM_SPACE_COMPONENTS}
    assert pairs == expected


def test_space_create_read_list_round_trip(client: TestClient) -> None:
    create = client.post("/api/spaces", json=_space_payload())
    assert create.status_code == 201
    created = create.json()
    assert created["name"] == "Lab A"
    assert created["template"] == "room"
    assert len(created["components"]) == 2
    assert created["components"][1]["asset_id"] is None
    assert created["created_at"]
    assert created["updated_at"]

    got = client.get(f"/api/spaces/{created['id']}")
    assert got.status_code == 200
    assert got.json() == created

    listed = client.get("/api/spaces")
    assert listed.status_code == 200
    ids = [space["id"] for space in listed.json()["spaces"]]
    assert ROOM_SPACE_ID in ids
    assert created["id"] in ids


def test_put_replaces_layout_and_drops_removed_components(client: TestClient) -> None:
    created = client.post("/api/spaces", json=_space_payload()).json()
    space_id = created["id"]

    update = client.put(
        f"/api/spaces/{space_id}",
        json={
            "name": "Lab B",
            "components": [
                {
                    "id": "c9",
                    "kind": "nas",
                    "x": -1.0,
                    "z": 0.5,
                    "asset_id": "asset-egov-portal",
                }
            ],
        },
    )
    assert update.status_code == 200
    body = update.json()
    assert body["name"] == "Lab B"
    assert [c["id"] for c in body["components"]] == ["c9"]
    assert body["template"] == "room"


def test_delete_returns_204_and_get_404(client: TestClient) -> None:
    created = client.post("/api/spaces", json=_space_payload()).json()
    space_id = created["id"]

    deleted = client.delete(f"/api/spaces/{space_id}")
    assert deleted.status_code == 204

    missing = client.get(f"/api/spaces/{space_id}")
    assert missing.status_code == 404


def test_422_bad_kind(client: TestClient) -> None:
    payload = _space_payload(
        components=[{"id": "c1", "kind": "printer", "x": 0, "z": 0, "asset_id": None}]
    )
    response = client.post("/api/spaces", json=payload)
    assert response.status_code == 422
    assert "detail" in response.json()


def test_422_out_of_bounds_coordinate(client: TestClient) -> None:
    payload = _space_payload(
        components=[{"id": "c1", "kind": "rack", "x": 6.1, "z": 0, "asset_id": None}]
    )
    response = client.post("/api/spaces", json=payload)
    assert response.status_code == 422
    assert "detail" in response.json()


def test_422_duplicate_component_id(client: TestClient) -> None:
    payload = _space_payload(
        components=[
            {"id": "c1", "kind": "rack", "x": 0, "z": 0, "asset_id": None},
            {"id": "c1", "kind": "pc", "x": 1, "z": 1, "asset_id": None},
        ]
    )
    response = client.post("/api/spaces", json=payload)
    assert response.status_code == 422
    assert "duplicate component id" in str(response.json()["detail"]).lower()


def test_422_unknown_asset(client: TestClient) -> None:
    payload = _space_payload(
        components=[{"id": "c1", "kind": "rack", "x": 0, "z": 0, "asset_id": "asset-missing"}]
    )
    response = client.post("/api/spaces", json=payload)
    assert response.status_code == 422
    assert "unknown asset_id" in str(response.json()["detail"])


def test_risk_null_for_unbound_and_real_for_bound(client: TestClient) -> None:
    created = client.post("/api/spaces", json=_space_payload()).json()
    space_id = created["id"]

    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    ingest = client.post(
        "/api/ingest/batch",
        json={
            "events": [
                {
                    "id": "01JTEST000000000000000001",
                    "ts": now,
                    "type": "port_scan",
                    "severity": "high",
                    "src": {"ip": "203.0.113.44", "host": None, "asset_id": None},
                    "dst": {
                        "ip": "10.10.1.10",
                        "host": "municipal-dc",
                        "asset_id": "asset-municipal-dc",
                    },
                    "description": "scan",
                    "mitre": None,
                    "risk_delta": None,
                    "raw_source": "test",
                    "meta": {},
                },
                {
                    "id": "01JTEST000000000000000002",
                    "ts": now,
                    "type": "malware",
                    "severity": "critical",
                    "src": {"ip": "203.0.113.44", "host": None, "asset_id": None},
                    "dst": {
                        "ip": "10.10.1.10",
                        "host": "municipal-dc",
                        "asset_id": "asset-municipal-dc",
                    },
                    "description": "malware",
                    "mitre": None,
                    "risk_delta": None,
                    "raw_source": "test",
                    "meta": {},
                },
            ]
        },
    )
    assert ingest.status_code == 200

    risk = client.get(f"/api/spaces/{space_id}/risk")
    assert risk.status_code == 200
    body = risk.json()
    assert body["space_id"] == space_id
    by_id = {c["id"]: c for c in body["components"]}

    bound = by_id["c1"]
    assert bound["asset_id"] == "asset-municipal-dc"
    assert bound["risk"] is not None
    assert bound["state"] in {"ok", "elevated", "critical", "compromised"}
    assert bound["events_24h"] >= 1

    unbound = by_id["c2"]
    assert unbound["asset_id"] is None
    assert unbound["risk"] is None
    assert unbound["state"] is None
    assert unbound["events_24h"] == 0
    assert unbound["last_event_ts"] is None
