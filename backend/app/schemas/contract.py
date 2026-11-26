"""Pydantic mirror of ``docs/api-contract.md``.

These models are the executable half of the contract: the API validates responses against
them, and tests assert that ``contract/*.sample.json`` parses cleanly. Field names, nullability
and enum values must match the document exactly — change both in the same PR.
"""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

Severity = Literal["info", "low", "medium", "high", "critical"]
AssetKind = Literal["scada", "server", "gateway", "district", "db", "service", "cctv", "external"]
LinkKind = Literal["network", "dependency", "dataflow"]
RiskStateName = Literal["ok", "elevated", "critical", "compromised"]
ThreatLevel = Literal["low", "guarded", "elevated", "high", "severe"]
SpaceTemplate = Literal["room"]
SpaceComponentKind = Literal["rack", "switch", "pc", "monitor", "nas", "cam", "iot"]

#: Canonical severity order, most severe last. Used for counts and threat level.
SEVERITIES: tuple[str, ...] = ("info", "low", "medium", "high", "critical")

#: Kill-chain stages reported by ``GET /api/state`` (progress 0..1 each).
KILL_CHAIN_STAGES: tuple[str, ...] = (
    "reconnaissance",
    "initial_access",
    "c2",
    "exploitation",
    "lateral_movement",
    "impact",
)


class Endpoint(BaseModel):
    """``src`` / ``dst`` of a ``SecurityEvent``. Every key is always present."""

    ip: Optional[str] = None
    host: Optional[str] = None
    asset_id: Optional[str] = None


class Mitre(BaseModel):
    tactic: str
    technique_id: str
    technique: str


class SecurityEvent(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(min_length=1, max_length=64)
    ts: str
    type: str
    severity: Severity
    src: Endpoint = Field(default_factory=Endpoint)
    dst: Endpoint = Field(default_factory=Endpoint)
    description: Optional[str] = None
    mitre: Optional[Mitre] = None
    risk_delta: Optional[float] = None
    raw_source: str = "unknown"
    meta: dict[str, Any] = Field(default_factory=dict)

    @field_validator("severity", mode="before")
    @classmethod
    def _normalise_severity(cls, value: Any) -> str:
        """Unknown or missing severities degrade to ``info`` — the contract forbids throwing."""
        text = str(value or "").strip().lower()
        return text if text in SEVERITIES else "info"


class AssetPosition(BaseModel):
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0


class Asset(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    name: str
    kind: AssetKind
    criticality: int = Field(ge=1, le=5)
    district: Optional[str] = None
    position: AssetPosition = Field(default_factory=AssetPosition)
    ip: Optional[str] = None
    tags: list[str] = Field(default_factory=list)


class Link(BaseModel):
    source: str
    target: str
    kind: LinkKind = "network"


class RiskState(BaseModel):
    asset_id: str
    risk: float = 0.0
    state: RiskStateName = "ok"
    events_24h: int = 0
    last_event_ts: Optional[str] = None
    top_types: list[str] = Field(default_factory=list)


class Counts(BaseModel):
    info: int = 0
    low: int = 0
    medium: int = 0
    high: int = 0
    critical: int = 0


class TypeCount(BaseModel):
    type: str
    count: int


class AggregateState(BaseModel):
    threat_level: ThreatLevel = "low"
    counts: Counts = Field(default_factory=Counts)
    compromised_assets: int = 0
    kill_chain: dict[str, float] = Field(
        default_factory=lambda: {stage: 0.0 for stage in KILL_CHAIN_STAGES}
    )
    top_types: list[TypeCount] = Field(default_factory=list)


class SpaceComponent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=64)
    kind: SpaceComponentKind
    x: float = Field(ge=-6.0, le=6.0)
    z: float = Field(ge=-5.0, le=5.0)
    asset_id: Optional[str] = None


class Space(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    template: SpaceTemplate
    components: list[SpaceComponent] = Field(default_factory=list)
    created_at: str
    updated_at: str


class SpaceRiskComponent(BaseModel):
    """One component's risk. All three risk fields are null when the device is unbound."""

    model_config = ConfigDict(extra="forbid")

    id: str
    asset_id: Optional[str] = None
    risk: Optional[float] = None
    state: Optional[RiskStateName] = None
    events_24h: Optional[int] = None


class SpaceRisk(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    components: list[SpaceRiskComponent] = Field(default_factory=list)


__all__ = [
    "AggregateState",
    "Asset",
    "AssetKind",
    "AssetPosition",
    "Counts",
    "Endpoint",
    "KILL_CHAIN_STAGES",
    "Link",
    "LinkKind",
    "Mitre",
    "RiskState",
    "RiskStateName",
    "SEVERITIES",
    "SecurityEvent",
    "Severity",
    "Space",
    "SpaceComponent",
    "SpaceComponentKind",
    "SpaceRisk",
    "SpaceRiskComponent",
    "SpaceTemplate",
    "ThreatLevel",
    "TypeCount",
]
