"""Suricata adapter: ``eve.json`` alerts -> normalised ``SecurityEvent`` objects.

Suricata writes one JSON object per line (NDJSON). This adapter reads the ``alert`` records —
the IDS verdicts with a signature and a category — and ignores the rest (``flow``, ``dns``,
``http``, ``stats``, ...): they describe traffic, not a detection, and mapping them to events
would flood the timeline with noise. Those record types can be added later without changing
the seam.

Like every adapter this module is a pure function of its input: no database, no network, no
configuration. Malformed or partial lines are skipped, never raised — one truncated line at
the tail of a live capture must not drop the whole file.

Classification sources, in order of authority:

1. ``alert.metadata.mitre_*`` — the rule author's own ATT&CK tagging, when present.
2. ``alert.category`` — Suricata's classification, mapped to a contract ``type``.
3. ``alert.severity`` — the rule's 1..255 level, mapped to the contract severity scale.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional

from app.ingest.base import Severity, iso_utc, make_event

#: Suricata's rule level is 1 (most severe) .. 255. Anything at or below ``info`` is context.
#: Mirrored in ``docs/threat-model.md``; keep both in sync.
SEVERITY_BY_LEVEL: dict[int, Severity] = {1: "high", 2: "medium", 3: "low"}
DEFAULT_SEVERITY: Severity = "info"

#: ``alert.category`` (lower-cased) -> contract type. Suricata ships these strings in
#: ``classification.config``; unknown categories degrade to ``other``.
CATEGORY_TO_TYPE: dict[str, str] = {
    "attempted information leak": "data_exfiltration",
    "information leak": "data_exfiltration",
    "web application attack": "web_attack",
    "exploit kit activity detected": "web_attack",
    "attempted administrator privilege gain": "credential_attack",
    "successful administrator privilege gain": "credential_attack",
    "attempted user privilege gain": "credential_attack",
    "successful user privilege gain": "credential_attack",
    "attempted credential theft": "credential_attack",
    "credential theft": "credential_attack",
    "detection of a network scan": "port_scan",
    "attempted recon": "recon",
    "attempted denial of service": "ddos",
    "denial of service": "ddos",
    "a network trojan was detected": "malware",
    "targeted malicious activity was detected": "malware",
    "malware command and control activity detected": "c2_beacon",
    "command and control": "c2_beacon",
    "potential corporate privacy violation": "policy_violation",
    "unusual client port": "anomaly",
    "potentially bad traffic": "anomaly",
    "misc activity": "anomaly",
    "generic protocol command decode": "anomaly",
    "unknown traffic": "anomaly",
}

DEFAULT_TYPE = "other"

#: Fallback ATT&CK attribution per contract type, used when the rule carries no metadata.
DEFAULT_MITRE: dict[str, dict[str, str]] = {
    "port_scan": {
        "tactic": "discovery",
        "technique_id": "T1046",
        "technique": "Network Service Discovery",
    },
    "recon": {
        "tactic": "reconnaissance",
        "technique_id": "T1595",
        "technique": "Active Scanning",
    },
    "credential_attack": {
        "tactic": "credential-access",
        "technique_id": "T1110",
        "technique": "Brute Force",
    },
    "web_attack": {
        "tactic": "initial-access",
        "technique_id": "T1190",
        "technique": "Exploit Public-Facing Application",
    },
    "c2_beacon": {
        "tactic": "command-and-control",
        "technique_id": "T1071",
        "technique": "Application Layer Protocol",
    },
    "data_exfiltration": {
        "tactic": "exfiltration",
        "technique_id": "T1041",
        "technique": "Exfiltration Over C2 Channel",
    },
    "malware": {
        "tactic": "execution",
        "technique_id": "T1204",
        "technique": "User Execution",
    },
    "ddos": {
        "tactic": "impact",
        "technique_id": "T1498",
        "technique": "Network Denial of Service",
    },
}


def type_for_category(category: Optional[str]) -> str:
    """Map a Suricata ``alert.category`` to a contract type; unknown -> ``other``."""
    if not category:
        return DEFAULT_TYPE
    return CATEGORY_TO_TYPE.get(category.strip().lower(), DEFAULT_TYPE)


def severity_for_level(level: Any) -> Severity:
    """Map Suricata's numeric rule level to the contract severity scale."""
    try:
        number = int(level)
    except (TypeError, ValueError):
        return DEFAULT_SEVERITY
    return SEVERITY_BY_LEVEL.get(number, DEFAULT_SEVERITY)


def mitre_for(metadata: Any, event_type: str) -> Optional[dict[str, str]]:
    """Prefer the rule's own ``mitre_*`` metadata, fall back to the type's default."""
    default = DEFAULT_MITRE.get(event_type)
    tagged = metadata if isinstance(metadata, dict) else {}

    technique_id = _first(tagged.get("mitre_technique_id"))
    if not technique_id:
        return dict(default) if default else None

    tactic = _normalise_tactic(_first(tagged.get("mitre_tactic_name")))
    if not tactic:
        tactic = (default or {}).get("tactic", "")
    if not tactic:
        # A technique without a tactic is a partial ATT&CK record; drop it rather than
        # inventing a tactic the rule never claimed.
        return None

    technique = (
        _first(tagged.get("mitre_technique_name"))
        or (default or {}).get("technique")
        or technique_id
    )
    return {"tactic": tactic, "technique_id": technique_id, "technique": technique}


def alert_to_event(
    record: dict[str, Any], *, raw_source: str = "suricata"
) -> Optional[dict[str, Any]]:
    """Convert one ``eve.json`` record to a ``SecurityEvent``, or ``None`` if unusable."""
    alert = record.get("alert")
    if not isinstance(alert, dict):
        return None

    epoch = _epoch_from_timestamp(record.get("timestamp"))
    if epoch is None:
        return None

    category = _text(alert.get("category"))
    signature = _text(alert.get("signature"))
    event_type = type_for_category(category)

    return make_event(
        event_type=event_type,
        severity=severity_for_level(alert.get("severity")),
        ts=iso_utc(epoch),
        src={"ip": _text(record.get("src_ip"))},
        dst={"ip": _text(record.get("dest_ip"))},
        description=signature or category,
        raw_source=raw_source,
        mitre=mitre_for(alert.get("metadata"), event_type),
        meta={
            "flow_id": record.get("flow_id"),
            "signature_id": alert.get("signature_id"),
            "category": category,
            "rev": alert.get("rev"),
            "proto": _text(record.get("proto")),
            "app_proto": _text(record.get("app_proto")),
        },
    )


def parse_eve_json(raw: str, *, raw_source: str = "suricata") -> list[dict[str, Any]]:
    """Parse a chunk of ``eve.json`` (NDJSON) into ``SecurityEvent`` dicts.

    Non-``alert`` records, blank lines and lines that are not complete JSON objects are
    skipped. Empty input yields an empty list; this function never raises on bad telemetry.
    """
    events: list[dict[str, Any]] = []
    for line in raw.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        try:
            record = json.loads(stripped)
        except json.JSONDecodeError:
            continue
        if not isinstance(record, dict):
            continue
        event = alert_to_event(record, raw_source=raw_source)
        if event is not None:
            events.append(event)
    return events


def _first(value: Any) -> Optional[str]:
    """Return the first string from a Suricata metadata value (list or scalar)."""
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, list):
        for item in value:
            text = _first(item)
            if text:
                return text
    return None


def _normalise_tactic(value: Optional[str]) -> str:
    """``"Credential Access"`` -> ``"credential-access"`` to match the contract's style."""
    if not value:
        return ""
    return "-".join(value.strip().lower().split())


def _text(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _epoch_from_timestamp(value: Any) -> Optional[float]:
    """Parse Suricata's ISO timestamp (``...481234+0000``) into a UTC epoch."""
    text = _text(value)
    if text is None:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    elif len(text) >= 5 and text[-5] in "+-" and text[-4:].isdigit():
        text = f"{text[:-2]}:{text[-2:]}"
    try:
        moment = datetime.fromisoformat(text)
    except ValueError:
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.timestamp()
