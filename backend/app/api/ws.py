"""Live feed at ``/ws/events``.

Server -> client frames are ``{kind, data}`` with ``kind`` one of ``event``, ``state``,
``risk``. This module emits ``event`` frames on ingest and throttled ``state`` and ``risk``
frames (about once per second).

Client -> server messages are limited to the reserved ``filter`` frame; other client messages
are rejected. The socket stays open/read-only for normal clients.
"""

from __future__ import annotations

import json
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
        self._last_risk_at: Optional[float] = None

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
            self._last_risk_at = None

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

    async def broadcast_risks(self, risks: Iterable[dict[str, Any]]) -> None:
        """Send one ``risk`` frame per changed asset."""
        self._last_risk_at = self._clock()
        for risk in risks:
            await self.broadcast({"kind": "risk", "data": risk})

    async def maybe_broadcast_risks(self, risks: Iterable[dict[str, Any]]) -> bool:
        """Emit risk frames unless they went out within ``state_interval`` seconds.

        The score is read fresh from the database for each pass, so a throttled pass loses no
        information: the next pass that gets through carries the current score.
        """
        pending = list(risks)
        if not pending or not self._connections:
            return False
        now = self._clock()
        if self._last_risk_at is not None and now - self._last_risk_at < self._state_interval:
            return False
        await self.broadcast_risks(pending)
        return True


#: Process-wide manager. The app runs a single event loop, so no locking is needed.
manager = ConnectionManager()


def _is_reserved_filter_frame(message: str) -> bool:
    try:
        payload = json.loads(message)
    except json.JSONDecodeError:
        return False
    return isinstance(payload, dict) and payload.get("kind") == "filter"


@router.websocket("/ws/events")
async def events_socket(websocket: WebSocket) -> None:
    """Accept a client and keep the connection open until it goes away.

    Server -> client is the normal direction. The only accepted client message is the reserved
    ``{"kind":"filter", ...}`` frame; any other client message is rejected.
    """
    await websocket.accept()
    await manager.connect(websocket)
    try:
        state = await run_in_threadpool(current_state)
        await websocket.send_json({"kind": "state", "data": state})
        while True:
            message = await websocket.receive_text()
            if _is_reserved_filter_frame(message):
                continue
            await websocket.close(
                code=1008,
                reason="Only the reserved filter frame is accepted from clients.",
            )
            return
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket)
