from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()


@router.get("/state")
def aggregate_state() -> dict[str, object]:
    """City-wide aggregate. Stub until the risk engine lands (phase 3)."""
    return {
        "threat_level": "low",
        "counts": {"info": 0, "low": 0, "medium": 0, "high": 0, "critical": 0},
        "compromised_assets": 0,
        "kill_chain": {
            "reconnaissance": 0.0,
            "initial_access": 0.0,
            "c2": 0.0,
            "exploitation": 0.0,
            "lateral_movement": 0.0,
            "impact": 0.0,
        },
        "top_types": [],
    }
