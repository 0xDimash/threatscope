"""Live feed at ``/ws/events``.

Server -> client only (contract v0.1). Every frame is ``{kind, data}`` with ``kind`` one of
``event``, ``state``, ``risk``. This module emits ``event`` frames on ingest and a throttled
``state`` frame (about once per second); ``risk`` arrives with the scoring engine.

The manager keeps no background tasks: state is emitted from the same request that produced
new data, so there is nothing to leak when a client disconnects. A connection occupies exactly
one coroutine, which ends when the socket closes.
"""

from __future__ import annotations

import time
from collections.abc import Callable, Iterable
from typing import Any, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.concurrency import run_in_threadpool

from app.core.db import SessionLocal
from app.services import repository

router = APIRouter()

#: Minimum seconds between ``state`` frames. The contract says "throttled, ~1/s".
STATE_INTERVAL_SECONDS = 1.0


def current_state() -> dict[str, Any]:
    """Aggregate state read from a short-lived session (safe to call from a worker thread)."""
    with SessionLocal() as session:
        return repository.aggregate_state(session)


class ConnectionManager:
    """Tracks open sockets and fans frames out to all of them."""

    def __init__(
        self,
        *,
        state_interval: float = STATE_INTERVAL_SECONDS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._connections: set[WebSocket] = set()
        self._state_interval = state_interval
        self._clock = clock
        self._last_state_at: Optional[float] = None

    @property
    def connection_count(self) -> int:
        return len(self._connections)

    async def connect(self, websocket: WebSocket) -> None:
        self._connections.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self._connections.discard(websocket)
        if not self._connections:
            # No listeners left, so the next client starts a fresh throttle window.
            self._last_state_at = None

    async def broadcast(self, frame: dict[str, Any]) -> None:
        """Send ``frame`` to every socket, dropping sockets that fail."""
        for websocket in list(self._connections):
            try:
                await websocket.send_json(frame)
            except Exception:  # noqa: BLE001 - a dead socket must never break the others
                self.disconnect(websocket)

    async def broadcast_events(self, events: Iterable[dict[str, Any]]) -> None:
        for event in events:
            await self.broadcast({"kind": "event", "data": event})

    async def broadcast_state(self, state: dict[str, Any]) -> None:
        self._last_state_at = self._clock()
        await self.broadcast({"kind": "state", "data": state})

    async def maybe_broadcast_state(self, state: dict[str, Any]) -> bool:
        """Emit a state frame unless one went out within ``state_interval`` seconds."""
        now = self._clock()
        if self._last_state_at is not None and now - self._last_state_at < self._state_interval:
            return False
        await self.broadcast_state(state)
        return True


#: Process-wide manager. The app runs a single event loop, so no locking is needed.
manager = ConnectionManager()


@router.websocket("/ws/events")
async def events_socket(websocket: WebSocket) -> None:
    """Accept a client and keep the connection open until it goes away.

    The client may send anything; unknown frames (including the future ``filter`` frame) are
    ignored. Sending is one-way for now.
    """
    await websocket.accept()
    await manager.connect(websocket)
    try:
        state = await run_in_threadpool(current_state)
        await websocket.send_json({"kind": "state", "data": state})
        while True:
            message = await websocket.receive_text()
            if message.strip().lower() == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket)
