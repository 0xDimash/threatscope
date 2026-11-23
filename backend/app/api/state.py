"""``GET /api/state`` — the city-wide aggregate fold."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import SessionDep
from app.schemas.contract import AggregateState
from app.services import repository

router = APIRouter()


@router.get("/state", response_model=AggregateState)
def aggregate_state(session: SessionDep) -> AggregateState:
    """Severity counts, score-driven threat level, top event types and kill-chain progress.

    ``threat_level`` comes from the highest latest asset risk (``app.services.risk``), so it can
    fall again after a quiet period instead of latching on the worst event ever seen.
    ``kill_chain`` comes from the event types in the same 24 h window (``app.services.kill_chain``).
    """
    return AggregateState.model_validate(repository.aggregate_state(session))
