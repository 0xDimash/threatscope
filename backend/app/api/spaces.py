"""`/api/spaces` — persistent room layouts and per-component risk."""

from __future__ import annotations

import re
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Response
from sqlalchemy import select

from app.api.deps import SessionDep
from app.models import Asset, Space
from app.schemas.api import SpaceCreateRequest, SpacesResponse, SpaceUpdateRequest
from app.schemas.contract import Space as SpaceContract
from app.schemas.contract import SpaceRisk, SpaceRiskComponent
from app.services import repository

router = APIRouter()

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _slugify(value: str) -> str:
    slug = _SLUG_RE.sub("-", value.strip().lower()).strip("-")
    return slug[:32] or "space"


def _new_space_id(name: str) -> str:
    return f"space-{_slugify(name)}-{secrets.token_hex(2)}"


def _validate_asset_ids(session: SessionDep, components: list[dict]) -> None:
    requested = {c.get("asset_id") for c in components if c.get("asset_id")}
    if not requested:
        return
    known = set(
        session.scalars(select(Asset.id).where(Asset.id.in_(requested))).all()
    )
    missing = sorted(requested - known)
    if missing:
        raise HTTPException(
            status_code=422,
            detail=f"unknown asset_id: {', '.join(missing)}",
        )


def _space_or_404(session: SessionDep, space_id: str) -> Space:
    space = session.get(Space, space_id)
    if space is None:
        raise HTTPException(status_code=404, detail=f"unknown space: {space_id}")
    return space


@router.get("/spaces", response_model=SpacesResponse)
def list_spaces(session: SessionDep) -> SpacesResponse:
    spaces = session.scalars(select(Space).order_by(Space.id)).all()
    return SpacesResponse(spaces=[SpaceContract.model_validate(s.as_contract()) for s in spaces])


@router.post("/spaces", response_model=SpaceContract, status_code=201)
def create_space(payload: SpaceCreateRequest, session: SessionDep) -> SpaceContract:
    components = [c.model_dump() for c in payload.components]
    _validate_asset_ids(session, components)
    now = datetime.now(timezone.utc)
    space = Space(
        id=_new_space_id(payload.name),
        name=payload.name,
        template=payload.template,
        components=components,
        created_at=now,
        updated_at=now,
    )
    session.add(space)
    session.commit()
    session.refresh(space)
    return SpaceContract.model_validate(space.as_contract())


@router.get("/spaces/{space_id}", response_model=SpaceContract)
def get_space(space_id: str, session: SessionDep) -> SpaceContract:
    space = _space_or_404(session, space_id)
    return SpaceContract.model_validate(space.as_contract())


@router.put("/spaces/{space_id}", response_model=SpaceContract)
def update_space(
    space_id: str, payload: SpaceUpdateRequest, session: SessionDep
) -> SpaceContract:
    space = _space_or_404(session, space_id)
    components = [c.model_dump() for c in payload.components]
    _validate_asset_ids(session, components)
    space.name = payload.name
    space.components = components
    space.updated_at = datetime.now(timezone.utc)
    session.add(space)
    session.commit()
    session.refresh(space)
    return SpaceContract.model_validate(space.as_contract())


@router.delete("/spaces/{space_id}", status_code=204)
def delete_space(space_id: str, session: SessionDep) -> Response:
    space = _space_or_404(session, space_id)
    session.delete(space)
    session.commit()
    return Response(status_code=204)


@router.get("/spaces/{space_id}/risk", response_model=SpaceRisk)
def get_space_risk(space_id: str, session: SessionDep) -> SpaceRisk:
    space = _space_or_404(session, space_id)
    components: list[SpaceRiskComponent] = []
    for component in space.components or []:
        asset_id = component.get("asset_id")
        if not asset_id:
            components.append(
                SpaceRiskComponent(
                    id=component.get("id", ""),
                    asset_id=None,
                    risk=None,
                    state=None,
                    events_24h=0,
                    last_event_ts=None,
                )
            )
            continue
        risk = repository.get_risk(session, asset_id)
        if risk is None:
            # Missing asset -> treat as unbound on read.
            components.append(
                SpaceRiskComponent(
                    id=component.get("id", ""),
                    asset_id=None,
                    risk=None,
                    state=None,
                    events_24h=0,
                    last_event_ts=None,
                )
            )
            continue
        components.append(
            SpaceRiskComponent(
                id=component.get("id", ""),
                asset_id=asset_id,
                risk=risk.get("risk"),
                state=risk.get("state"),
                events_24h=risk.get("events_24h", 0),
                last_event_ts=risk.get("last_event_ts"),
            )
        )
    return SpaceRisk(space_id=space.id, components=components)
