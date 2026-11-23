"""Asset mapping: IP/host -> ``asset_id`` (``app.services.mapping``).

Every event that reaches the repository should point at a node the frontend can draw an arc
to; everything that cannot be resolved must stay ``None`` rather than be guessed.
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ingest.base import make_event
from app.models import Asset, Event
from app.services import repository
from app.services.mapping import apply_mapping, build_lookup

TS = "2026-11-10T09:14:22.481Z"


def endpoint(
    ip: Optional[str] = None,
    host: Optional[str] = None,
    asset_id: Optional[str] = None,
) -> dict[str, Any]:
    return {"ip": ip, "host": host, "asset_id": asset_id}


def event(
    *,
    src: Optional[dict[str, Any]] = None,
    dst: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    return {"src": src or endpoint(), "dst": dst or endpoint()}


def contract_event(*, src: dict[str, Any], dst: dict[str, Any]) -> dict[str, Any]:
    return make_event(
        event_type="port_scan",
        severity="medium",
        ts=TS,
        src=src,
        dst=dst,
        description="test",
        raw_source="test",
    )


def test_maps_destination_by_ip(session: Session, seeded_assets: None) -> None:
    mapped = apply_mapping(session, [event(dst=endpoint(ip="10.10.4.21"))])

    assert mapped[0]["dst"]["asset_id"] == "asset-egov-portal"


def test_maps_source_by_ip(session: Session, seeded_assets: None) -> None:
    mapped = apply_mapping(session, [event(src=endpoint(ip="10.20.0.5"))])

    assert mapped[0]["src"]["asset_id"] == "asset-water-scada"


def test_maps_by_host_aliases(session: Session, seeded_assets: None) -> None:
    lookup = build_lookup(session)

    for alias in ("egov-portal", "Egov Portal", "EGOV-PORTAL.", "asset-egov-portal"):
        assert lookup.by_host(alias) == "asset-egov-portal", alias


def test_unknown_endpoints_stay_null(session: Session, seeded_assets: None) -> None:
    mapped = apply_mapping(
        session,
        [event(src=endpoint(ip="203.0.113.44", host="evil.example"), dst=endpoint(ip="10.99.0.1"))],
    )

    assert mapped[0]["src"]["asset_id"] is None
    assert mapped[0]["dst"]["asset_id"] is None


def test_explicit_asset_id_is_never_overwritten(session: Session, seeded_assets: None) -> None:
    mapped = apply_mapping(session, [event(dst=endpoint(ip="10.10.4.21", asset_id="asset-manual"))])

    assert mapped[0]["dst"]["asset_id"] == "asset-manual"


def test_address_beats_host_name(session: Session, seeded_assets: None) -> None:
    mapped = apply_mapping(session, [event(dst=endpoint(ip="10.20.0.5", host="egov-portal"))])

    assert mapped[0]["dst"]["asset_id"] == "asset-water-scada"


def test_cidr_assets_match_their_range(session: Session, seeded_assets: None) -> None:
    session.add(
        Asset(
            id="asset-cctv-range",
            name="CCTV Range",
            kind="cctv",
            criticality=4,
            district="Almaly",
            position={},
            ip="10.30.0.0/16",
            tags=[],
        )
    )
    session.commit()

    mapped = apply_mapping(
        session,
        [event(dst=endpoint(ip="10.30.7.9")), event(dst=endpoint(ip="10.31.0.1"))],
    )

    assert mapped[0]["dst"]["asset_id"] == "asset-cctv-range"
    assert mapped[1]["dst"]["asset_id"] is None


def test_duplicate_ips_resolve_deterministically(session: Session, seeded_assets: None) -> None:
    for asset_id in ("asset-zzz", "asset-aaa"):
        session.add(
            Asset(
                id=asset_id,
                name=asset_id,
                kind="server",
                criticality=2,
                district=None,
                position={},
                ip="10.99.0.1",
                tags=[],
            )
        )
    session.commit()

    mapped = apply_mapping(session, [event(dst=endpoint(ip="10.99.0.1"))])

    assert mapped[0]["dst"]["asset_id"] == "asset-aaa"


def test_missing_endpoints_are_safe(session: Session, seeded_assets: None) -> None:
    mapped = apply_mapping(
        session,
        [
            {},
            {"src": None, "dst": {"ip": None, "host": None}},
            {"src": {"ip": "", "host": "  "}},
        ],
    )

    assert mapped[0]["dst"].get("asset_id") is None
    assert mapped[1]["dst"].get("asset_id") is None
    assert mapped[2]["src"].get("asset_id") is None


def test_input_events_are_not_mutated(session: Session, seeded_assets: None) -> None:
    original = event(dst=endpoint(ip="10.10.4.21"))

    mapped = apply_mapping(session, [original])

    assert original["dst"]["asset_id"] is None
    assert mapped[0]["dst"]["asset_id"] == "asset-egov-portal"
    assert mapped[0] is not original


def test_repository_maps_endpoints_on_insert(session: Session, seeded_assets: None) -> None:
    stored = repository.add_events(
        session,
        [
            contract_event(
                src=endpoint(ip="203.0.113.44"),
                dst=endpoint(ip="10.10.4.21", host="egov-portal"),
            )
        ],
    )
    assert stored == 1

    row = session.scalars(select(Event)).one()
    assert row.dst_asset_id == "asset-egov-portal"
    assert row.src_asset_id is None


def test_repository_keeps_an_explicit_asset_id(session: Session, seeded_assets: None) -> None:
    repository.add_events(
        session,
        [contract_event(src=endpoint(), dst=endpoint(ip="10.10.4.21", asset_id="asset-manual"))],
    )

    row = session.scalars(select(Event)).one()
    assert row.dst_asset_id == "asset-manual"
