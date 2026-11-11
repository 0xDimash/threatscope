"""``/api/assets`` and ``/api/assets/{id}/risk``."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from app.core.config import REPO_ROOT
from app.models import RiskSnapshot

SAMPLE_ASSETS: Path = REPO_ROOT / "contract" / "assets.sample.json"


def sample_assets() -> dict[str, Any]:
    return json.loads(SAMPLE_ASSETS.read_text(encoding="utf-8"))


def test_assets_endpoint_serves_the_seeded_inventory(client: TestClient) -> None:
    inventory = sample_assets()

    body = client.get("/api/assets").json()

    assert body["assets"] == inventory["assets"]
    assert body["links"] == inventory["links"]


def test_unknown_asset_risk_is_404(client: TestClient) -> None:
    response = client.get("/api/assets/asset-does-not-exist/risk")

    assert response.status_code == 404


def test_unscored_asset_risk_is_zero_state(client: TestClient) -> None:
    body = client.get("/api/assets/asset-egov-portal/risk").json()

    assert body == {
        "asset_id": "asset-egov-portal",
        "risk": 0.0,
        "state": "ok",
        "events_24h": 0,
        "last_event_ts": None,
        "top_types": [],
    }


def test_asset_risk_serves_the_latest_snapshot(client: TestClient, session) -> None:
    session.add_all(
        [
            RiskSnapshot(
                asset_id="asset-water-scada",
                ts="2026-11-10T09:00:00.000Z",
                risk=12.0,
                state="elevated",
                events_24h=3,
                top_types=["port_scan"],
            ),
            RiskSnapshot(
                asset_id="asset-water-scada",
                ts="2026-11-10T11:00:00.000Z",
                risk=88.0,
                state="compromised",
                events_24h=9,
                top_types=["scada_intrusion"],
            ),
        ]
    )
    session.commit()

    body = client.get("/api/assets/asset-water-scada/risk").json()

    assert body["risk"] == 88.0
    assert body["state"] == "compromised"
    assert body["events_24h"] == 9
    assert body["last_event_ts"] == "2026-11-10T11:00:00.000Z"
    assert body["top_types"] == ["scada_intrusion"]
