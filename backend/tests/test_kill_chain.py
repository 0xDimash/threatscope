"""Kill-chain semantics: pure mapping plus the aggregate-state wiring."""

from __future__ import annotations

import time
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.ingest.base import iso_utc, make_event
from app.schemas.contract import KILL_CHAIN_STAGES
from app.services import kill_chain


def test_stage_for_known_types() -> None:
    assert kill_chain.stage_for("port_scan") == "reconnaissance"
    assert kill_chain.stage_for("credential_attack") == "initial_access"
    assert kill_chain.stage_for("c2_beacon") == "c2"
    assert kill_chain.stage_for("ransomware") == "exploitation"
    assert kill_chain.stage_for("scada_intrusion") == "impact"


def test_stage_for_unknown_types_is_none() -> None:
    assert kill_chain.stage_for("made_up_type") is None
    assert kill_chain.stage_for(None) is None
    assert kill_chain.stage_for("  PORT_SCAN  ") == "reconnaissance"


def test_progress_is_zero_for_every_stage_without_events() -> None:
    assert kill_chain.progress({}) == {stage: 0.0 for stage in KILL_CHAIN_STAGES}


def test_progress_scales_and_saturates() -> None:
    assert kill_chain.progress({"recon": 1})["reconnaissance"] == 0.2
    assert kill_chain.progress({"recon": 2, "port_scan": 1})["reconnaissance"] == 0.6
    assert kill_chain.progress({"recon": 5})["reconnaissance"] == 1.0
    assert kill_chain.progress({"recon": 50})["reconnaissance"] == 1.0


def test_progress_ignores_unmapped_and_empty_counts() -> None:
    result = kill_chain.progress({"made_up_type": 100, "recon": 0, "port_scan": 1})

    assert result["reconnaissance"] == 0.2
    assert all(value == 0.0 for stage, value in result.items() if stage != "reconnaissance")


def event(event_type: str) -> dict[str, Any]:
    return make_event(
        event_type=event_type,
        severity="low",
        ts=iso_utc(time.time()),
        src={"ip": "203.0.113.9"},
        dst={"ip": "10.10.4.21", "asset_id": "asset-egov-portal"},
        raw_source="test",
    )


def test_aggregate_state_starts_with_empty_kill_chain(client: TestClient) -> None:
    assert client.get("/api/state").json()["kill_chain"] == {
        stage: 0.0 for stage in KILL_CHAIN_STAGES
    }


def test_kill_chain_follows_recent_event_types(client: TestClient) -> None:
    client.post(
        "/api/ingest/batch",
        json={"events": [event("recon"), event("port_scan"), event("port_scan")]},
    )

    first = client.get("/api/state").json()["kill_chain"]
    assert first["reconnaissance"] == pytest.approx(0.6)
    assert first["initial_access"] == 0.0
    assert first["impact"] == 0.0

    client.post(
        "/api/ingest/batch",
        json={"events": [event("port_scan"), event("port_scan")]},
    )

    second = client.get("/api/state").json()["kill_chain"]
    assert second["reconnaissance"] == 1.0


def test_unknown_event_types_do_not_advance_the_chain(client: TestClient) -> None:
    client.post("/api/ingest/batch", json={"events": [event("made_up_type")]})

    assert client.get("/api/state").json()["kill_chain"] == {
        stage: 0.0 for stage in KILL_CHAIN_STAGES
    }
