"""`/api/spaces` — persistent layouts and per-component risk."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import pytest
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
    assert set(body) == {"id", "components"}
    assert body["id"] == space_id
    by_id = {c["id"]: c for c in body["components"]}

    bound = by_id["c1"]
    assert set(bound) == {"id", "asset_id", "risk", "state", "events_24h"}
    assert bound["asset_id"] == "asset-municipal-dc"
    assert bound["risk"] is not None
    assert bound["state"] in {"ok", "elevated", "critical", "compromised"}
    assert bound["events_24h"] >= 1

    # Risk is read through the same repository call the asset endpoint uses.
    asset_risk = client.get("/api/assets/asset-municipal-dc/risk").json()
    assert bound["risk"] == asset_risk["risk"]
    assert bound["state"] == asset_risk["state"]
    assert bound["events_24h"] == asset_risk["events_24h"]

    unbound = by_id["c2"]
    assert unbound == {
        "id": "c2",
        "asset_id": None,
        "risk": None,
        "state": None,
        "events_24h": None,
    }


def test_seeded_room_uses_the_frontend_device_ids_and_positions(client: TestClient) -> None:
    body = client.get(f"/api/spaces/{ROOM_SPACE_ID}").json()
    by_id = {c["id"]: c for c in body["components"]}

    assert set(by_id) == {
        "room-rack", "room-switch", "room-pc1", "room-pc2",
        "room-monitor", "room-nas", "room-cam", "room-iot",
    }
    assert {c["id"]: c["asset_id"] for c in body["components"]} == {
        "room-rack": "asset-municipal-dc",
        "room-switch": "asset-egov-gateway",
        "room-pc1": "asset-egov-portal",
        "room-pc2": "asset-akimat-portal",
        "room-monitor": "asset-open-data-portal",
        "room-nas": "asset-citizen-registry-db",
        "room-cam": "asset-cctv-network",
        "room-iot": "asset-transit-onay",
    }
    assert by_id["room-switch"]["x"] == -4.0
    assert by_id["room-pc2"]["x"] == 2.0
    assert by_id["room-monitor"]["kind"] == "monitor"
    assert by_id["room-monitor"]["z"] == 1.6


def test_missing_asset_still_returns_null_risk_fields(client: TestClient) -> None:
    # asset-citizen-registry-db is bound in the room but absent from the test inventory.
    body = client.get(f"/api/spaces/{ROOM_SPACE_ID}/risk").json()
    stale = {c["id"]: c for c in body["components"]}["room-nas"]

    assert stale == {
        "id": "room-nas",
        "asset_id": "asset-citizen-registry-db",
        "risk": None,
        "state": None,
        "events_24h": None,
    }


def test_explicit_space_id_is_honoured_and_duplicates_are_409(client: TestClient) -> None:
    created = client.post("/api/spaces", json={**_space_payload(), "id": "lab-1"})
    assert created.status_code == 201
    assert created.json()["id"] == "lab-1"

    duplicate = client.post("/api/spaces", json={**_space_payload(), "id": "lab-1"})
    assert duplicate.status_code == 409
    assert client.get("/api/spaces/lab-1").json() == created.json()


@pytest.mark.parametrize(
    "payload",
    [
        _space_payload(name="x"),
        _space_payload(name="x" * 41),
        _space_payload(
            components=[
                {"id": f"c{i}", "kind": "pc", "x": 0, "z": 0, "asset_id": None}
                for i in range(65)
            ]
        ),
    ],
)
def test_422_bad_name_or_too_many_components(client: TestClient, payload: dict[str, Any]) -> None:
    assert client.post("/api/spaces", json=payload).status_code == 422


def test_put_unknown_space_is_404(client: TestClient) -> None:
    assert client.put("/api/spaces/nope", json={"name": "Room"}).status_code == 404
