from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()

_SAMPLE_ASSETS = [
    {
        "id": "asset-egov-portal",
        "name": "Egov Portal",
        "kind": "service",
        "criticality": 4,
        "district": "Bostandyk",
        "position": {"x": 0, "y": 6, "z": 0},
        "tags": ["public"],
    },
    {
        "id": "asset-municipal-dc",
        "name": "Municipal DC",
        "kind": "server",
        "criticality": 5,
        "district": "Almaly",
        "position": {"x": -10, "y": 3, "z": 6},
        "tags": ["core"],
    },
    {
        "id": "asset-water-scada",
        "name": "Water SCADA",
        "kind": "scada",
        "criticality": 5,
        "district": "Almaly",
        "position": {"x": 12, "y": 3, "z": -8},
        "tags": ["ics"],
    },
]

_SAMPLE_LINKS = [
    {"source": "asset-egov-portal", "target": "asset-municipal-dc", "kind": "network"},
]


@router.get("/assets")
def list_assets() -> dict[str, object]:
    """Temporary in-memory sample; replace with DB-backed repository (Cyber B)."""
    return {"assets": _SAMPLE_ASSETS, "links": _SAMPLE_LINKS}
