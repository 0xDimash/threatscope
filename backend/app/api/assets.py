"""``GET /api/assets`` and ``GET /api/assets/{id}/risk`` — the city and its risk state."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.api.deps import SessionDep
from app.schemas.api import AssetsResponse
from app.schemas.contract import RiskState
from app.services import repository

router = APIRouter()


@router.get("/assets", response_model=AssetsResponse)
def list_assets(session: SessionDep) -> AssetsResponse:
    """Return the inventory exactly as seeded from ``data/assets.json``."""
    assets, links = repository.list_assets(session)
    return AssetsResponse(assets=assets, links=links)


@router.get("/assets/{asset_id}/risk", response_model=RiskState)
def asset_risk(asset_id: str, session: SessionDep) -> RiskState:
    """Latest risk snapshot for one asset.

    An asset that has never been scored returns a zero state; an unknown asset is a 404 so
    the UI can tell ``no data yet`` from ``no such thing``.
    """
    risk = repository.get_risk(session, asset_id)
    if risk is None:
        raise HTTPException(status_code=404, detail=f"unknown asset: {asset_id}")
    return RiskState.model_validate(risk)
