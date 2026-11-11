"""``GET /api/state`` — the city-wide aggregate fold."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import SessionDep
from app.schemas.contract import AggregateState
from app.services import repository

router = APIRouter()


@router.get("/state", response_model=AggregateState)
def aggregate_state(session: SessionDep) -> AggregateState:
    """Severity counts, threat level, top event types and the kill-chain placeholder.

    ``threat_level`` is currently derived from the worst severity present; the risk engine
    (phase 3) will replace that with a score-driven level without changing this shape.
    """
    return AggregateState.model_validate(repository.aggregate_state(session))
