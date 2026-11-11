"""``POST /api/ingest`` (adapter dispatch) and ``POST /api/ingest/batch`` (simulator path)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from app.core.config import REPO_ROOT

SAMPLE_EVENTS: Path = REPO_ROOT / "contract" / "events.sample.json"
ZEEK_NOTICE: Path = Path(__file__).parent / "fixtures" / "zeek" / "notice.log"


def sample_events() -> list[dict[str, Any]]:
    return json.loads(SAMPLE_EVENTS.read_text(encoding="utf-8"))


def test_batch_ingest_stores_every_event(client: TestClient) -> None:
    response = client.post("/api/ingest/batch", json={"events": sample_events()})

    assert response.status_code == 200
    assert response.json() == {"accepted": 5, "stored": 5}
    assert len(client.get("/api/events").json()["events"]) == 5


def test_batch_ingest_is_idempotent(client: TestClient) -> None:
    payload = {"events": sample_events()}

    client.post("/api/ingest/batch", json=payload)
    response = client.post("/api/ingest/batch", json=payload)

    assert response.status_code == 200
    assert response.json() == {"accepted": 5, "stored": 5}


def test_batch_ingest_rejects_a_malformed_event(client: TestClient) -> None:
    response = client.post(
        "/api/ingest/batch",
        json={"events": [{"id": "broken", "type": "port_scan"}]},
    )

    assert response.status_code == 422


def test_zeek_source_parses_raw_text(client: TestClient) -> None:
    raw = ZEEK_NOTICE.read_text(encoding="utf-8")

    response = client.post("/api/ingest", json={"source": "zeek", "raw": raw})

    assert response.status_code == 200
    body = response.json()
    assert body["accepted"] == 4
    assert body["stored"] == 4

    stored = client.get("/api/events").json()["events"]
    assert stored
    assert {event["raw_source"] for event in stored} == {"zeek"}


def test_source_is_case_insensitive(client: TestClient) -> None:
    raw = ZEEK_NOTICE.read_text(encoding="utf-8")

    response = client.post("/api/ingest", json={"source": " Zeek ", "raw": raw})

    assert response.status_code == 200
    assert response.json()["stored"] == 4


def test_empty_raw_text_is_accepted_and_stores_nothing(client: TestClient) -> None:
    response = client.post("/api/ingest", json={"source": "zeek", "raw": "   \n"})

    assert response.status_code == 200
    assert response.json() == {"accepted": 0, "stored": 0}


def test_unknown_source_is_a_client_error(client: TestClient) -> None:
    response = client.post("/api/ingest", json={"source": "suricata", "raw": "{}"})

    assert response.status_code == 400
    assert "zeek" in response.json()["detail"]


def test_unparseable_raw_text_is_a_client_error(client: TestClient) -> None:
    response = client.post("/api/ingest", json={"source": "zeek", "raw": "not a zeek log"})

    assert response.status_code == 400


def test_zeek_events_are_queryable_after_ingest(client: TestClient) -> None:
    raw = ZEEK_NOTICE.read_text(encoding="utf-8")
    client.post("/api/ingest", json={"source": "zeek", "raw": raw})

    body = client.get("/api/state").json()

    assert sum(body["counts"].values()) == 4
