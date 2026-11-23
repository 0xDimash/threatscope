"""Kill-chain progress from observed event types — pure, no database access.

``GET /api/state`` reports progress per contract stage as a number in 0..1. This module owns the
*meaning*: which event type counts as which stage, and when a stage is "complete". The
repository only supplies counts within the scoring window.

Unknown types are ignored rather than guessed: a type the threat model does not understand must
not silently advance the chain.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Mapping
from typing import Optional

from app.schemas.contract import KILL_CHAIN_STAGES

#: Five events in a stage take its meter to 1.0. Fewer events scale linearly.
STAGE_SATURATION = 5.0

#: Contract event type -> kill-chain stage. Types not listed here are deliberately unmapped.
#: `malware` and `c2_beacon` share a stage because an implant without observed beaconing is
#: still treated as establishing a foothold, not as exploitation.
STAGE_BY_TYPE: dict[str, str] = {
    "recon": "reconnaissance",
    "port_scan": "reconnaissance",
    "phishing": "initial_access",
    "credential_attack": "initial_access",
    "web_attack": "initial_access",
    "malware": "c2",
    "c2_beacon": "c2",
    "lateral_movement": "lateral_movement",
    "exploitation": "exploitation",
    "ransomware": "exploitation",
    "ddos": "impact",
    "defacement": "impact",
    "data_exfiltration": "impact",
    "scada_intrusion": "impact",
}


def stage_for(event_type: Optional[str]) -> Optional[str]:
    """Return the kill-chain stage for a contract type, or ``None`` when unmapped."""
    if not event_type:
        return None
    return STAGE_BY_TYPE.get(event_type.strip().lower())


def progress(counts: Mapping[str, int]) -> dict[str, float]:
    """Turn ``{event_type: count}`` into the contract's per-stage 0..1 progress.

    Each stage saturates at five events; all stages are always present, so the API shape is
    stable even when nothing has been observed.
    """
    totals: Counter[str] = Counter()
    for event_type, count in counts.items():
        stage = stage_for(event_type)
        if stage is not None and count > 0:
            totals[stage] += int(count)

    return {
        stage: round(min(1.0, totals[stage] / STAGE_SATURATION), 2)
        for stage in KILL_CHAIN_STAGES
    }
