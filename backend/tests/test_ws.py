"""``/ws/events``: frame contract, fan-out, throttling and cleanup."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import anyio
from fastapi.testclient import TestClient

from app.api.ws import ConnectionManager, manager
from app.core.config import REPO_ROOT

SAMPLE_EVENTS: Path = REPO_ROOT / "contract" / "events.sample.json"
ZEEK_NOTICE: Path = Path(__file__).parent / "fixtures" / "zeek" / "notice.log"


def sample_events() -> list[dict[str, Any]]:
    return json.loads(SAMPLE_EVENTS.read_text(encoding="utf-8"))


class FakeSocket:
    """Minimal stand-in for ``starlette.websockets.WebSocket``."""

    def __init__(self) -> None:
        self.frames: list[dict[str, Any]] = []

    async def send_json(self, frame: dict[str, Any]) -> None:
        self.frames.append(frame)


def test_initial_frame_is_state(client: TestClient) -> None:
    with client.websocket_connect("/ws/events") as socket:
        frame = socket.receive_json()

        assert frame["kind"] == "state"
        assert set(frame["data"]) == {
            "threat_level",
            "counts",
            "compromised_assets",
            "kill_chain",
            "top_types",
        }


def test_ingested_event_reaches_two_clients(client: TestClient) -> None:
    event = sample_events()[0]

    with (
        client.websocket_connect("/ws/events") as first,
        client.websocket_connect("/ws/events") as second,
    ):
        assert first.receive_json()["kind"] == "state"
        assert second.receive_json()["kind"] == "state"

        response = client.post("/api/ingest/batch", json={"events": [event]})
        assert response.status_code == 200

        first_frame = first.receive_json()
        second_frame = second.receive_json()

        assert first_frame == second_frame
        assert first_frame["kind"] == "event"
        assert first_frame["data"]["id"] == event["id"]


def test_zeek_ingest_broadcasts_parsed_events(client: TestClient) -> None:
    raw = ZEEK_NOTICE.read_text(encoding="utf-8")

    with client.websocket_connect("/ws/events") as socket:
        socket.receive_json()
        response = client.post("/api/ingest", json={"source": "zeek", "raw": raw})

        assert response.status_code == 200
        frame = socket.receive_json()
        assert frame["kind"] == "event"
        assert frame["data"]["raw_source"] == "zeek"


def test_disconnect_removes_the_socket(client: TestClient) -> None:
    with client.websocket_connect("/ws/events") as socket:
        socket.receive_json()
        assert manager.connection_count == 1

    assert manager.connection_count == 0


def test_manager_broadcasts_to_every_socket() -> None:
    async def scenario() -> None:
        local = ConnectionManager()
        first, second = FakeSocket(), FakeSocket()
        await local.connect(first)  # type: ignore[arg-type]
        await local.connect(second)  # type: ignore[arg-type]

        await local.broadcast({"kind": "event", "data": {"id": "1"}})

        expected = [{"kind": "event", "data": {"id": "1"}}]
        assert first.frames == expected
        assert second.frames == expected

    anyio.run(scenario)


def test_dead_socket_is_dropped_and_others_still_receive() -> None:
    class BrokenSocket:
        async def send_json(self, _frame: dict[str, Any]) -> None:
            raise RuntimeError("socket closed")

    async def scenario() -> None:
        local = ConnectionManager()
        healthy = FakeSocket()
        await local.connect(healthy)  # type: ignore[arg-type]
        await local.connect(BrokenSocket())  # type: ignore[arg-type]

        await local.broadcast({"kind": "state", "data": {}})

        assert local.connection_count == 1
        assert len(healthy.frames) == 1

    anyio.run(scenario)


def test_state_frames_are_throttled() -> None:
    class Clock:
        now = 100.0

        def __call__(self) -> float:
            return self.now

    async def scenario() -> None:
        clock = Clock()
        local = ConnectionManager(state_interval=1.0, clock=clock)
        socket = FakeSocket()
        await local.connect(socket)  # type: ignore[arg-type]

        assert await local.maybe_broadcast_state({"n": 1}) is True
        assert await local.maybe_broadcast_state({"n": 2}) is False

        clock.now += 1.1
        assert await local.maybe_broadcast_state({"n": 3}) is True

        assert [frame["data"] for frame in socket.frames] == [{"n": 1}, {"n": 3}]

    anyio.run(scenario)


def test_throttle_resets_when_the_last_client_leaves() -> None:
    async def scenario() -> None:
        local = ConnectionManager(state_interval=10.0)
        socket = FakeSocket()
        await local.connect(socket)  # type: ignore[arg-type]
        assert await local.maybe_broadcast_state({}) is True
        assert await local.maybe_broadcast_state({}) is False

        local.disconnect(socket)  # type: ignore[arg-type]

        assert await local.maybe_broadcast_state({}) is True

    anyio.run(scenario)
