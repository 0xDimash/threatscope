"""Zeek adapter: raw Zeek logs -> normalised ``SecurityEvent`` objects.

Supports the classic Zeek TSV format (the ``#separator`` / ``#fields`` header followed by
tab-separated rows) and, in this phase, classifies rows of ``notice.log``. ``conn.log`` and
``dns.log`` follow in later PRs; Zeek JSON output is not supported yet.

Like every adapter this module is a pure function of its input: no database, no network,
no clock except for event ids and no configuration. Parsing never raises on a single bad
row — unusable rows are skipped so one malformed line cannot drop a whole capture.
"""

from __future__ import annotations

from typing import Any, Optional

from app.ingest.base import Severity, iso_utc, make_event

#: (note prefix, contract type, severity, MITRE ATT&CK) — longest matching prefix wins.
#: Mirrored as a table in ``docs/threat-model.md``; keep both in sync.
NoticeRule = tuple[str, str, Severity, Optional[dict[str, Any]]]

NOTICE_RULES: tuple[NoticeRule, ...] = (
    (
        "Scan::Port_Scan",
        "port_scan",
        "medium",
        {
            "tactic": "discovery",
            "technique_id": "T1046",
            "technique": "Network Service Discovery",
        },
    ),
    (
        "Scan::VulnerabilityScan",
        "recon",
        "medium",
        {"tactic": "reconnaissance", "technique_id": "T1595", "technique": "Active Scanning"},
    ),
    (
        "Scan::Address_Scan",
        "recon",
        "low",
        {"tactic": "reconnaissance", "technique_id": "T1595", "technique": "Active Scanning"},
    ),
    (
        "SSH::Password_Guessing",
        "credential_attack",
        "high",
        {"tactic": "credential-access", "technique_id": "T1110", "technique": "Brute Force"},
    ),
    (
        "SSH::Bruteforce",
        "credential_attack",
        "high",
        {"tactic": "credential-access", "technique_id": "T1110", "technique": "Brute Force"},
    ),
    (
        "HTTP::SQL_Injection",
        "web_attack",
        "high",
        {
            "tactic": "initial-access",
            "technique_id": "T1190",
            "technique": "Exploit Public-Facing Application",
        },
    ),
    (
        "HTTP::Directory_Traversal",
        "web_attack",
        "medium",
        {
            "tactic": "discovery",
            "technique_id": "T1083",
            "technique": "File and Directory Discovery",
        },
    ),
    (
        "C2::",
        "c2_beacon",
        "high",
        {
            "tactic": "command-and-control",
            "technique_id": "T1071",
            "technique": "Application Layer Protocol",
        },
    ),
    (
        "DNS::Tunnel",
        "c2_beacon",
        "high",
        {
            "tactic": "command-and-control",
            "technique_id": "T1071",
            "technique": "Application Layer Protocol",
        },
    ),
    ("Policy::", "policy_violation", "low", None),
    ("Weird::", "anomaly", "low", None),
    ("CaptureLoss::", "anomaly", "info", None),
)

DEFAULT_TYPE = "other"
DEFAULT_SEVERITY: Severity = "info"

# Sorted once so a prefix such as ``Scan::Port_Scan`` beats a shorter overlapping one.
_RULES_BY_PREFIX = sorted(NOTICE_RULES, key=lambda rule: len(rule[0]), reverse=True)

# Zeek writes these tokens for "field unset" and "empty value".
_UNSET_TOKENS = frozenset({"-", "(empty)"})


def classify_notice(note: Optional[str]) -> tuple[str, Severity, Optional[dict[str, Any]]]:
    """Map a Zeek notice name to ``(type, severity, mitre)``.

    Unknown or missing notices return ``("other", "info", None)``: the contract requires
    graceful degradation, and an unclassified notice must not inflate risk.
    """
    if not note:
        return DEFAULT_TYPE, DEFAULT_SEVERITY, None
    for prefix, event_type, severity, mitre in _RULES_BY_PREFIX:
        if note.startswith(prefix):
            return event_type, severity, dict(mitre) if mitre is not None else None
    return DEFAULT_TYPE, DEFAULT_SEVERITY, None


def _clean(value: Optional[str]) -> Optional[str]:
    """Normalise a raw Zeek field to ``None`` when it carries no value."""
    if value is None:
        return None
    stripped = value.strip()
    if not stripped or stripped in _UNSET_TOKENS:
        return None
    return stripped


def _decode_separator(value: str) -> str:
    """Decode Zeek's escaped separator directive, e.g. ``\\x09`` -> a tab."""
    if value.startswith("\\x"):
        try:
            return chr(int(value[2:], 16))
        except ValueError:
            return "\t"
    return value


def read_tsv(raw: str) -> tuple[dict[str, str], list[dict[str, str]]]:
    """Split a Zeek TSV log into its header directives and its records.

    Returns ``(header, records)`` where ``header`` holds directive values (``separator``,
    ``path``, ``fields``) and each record maps the ``#fields`` names to raw strings.
    """
    header: dict[str, Any] = {"separator": "\t"}
    field_names: list[str] = []
    rows: list[str] = []
    for line in raw.splitlines():
        if not line.strip():
            continue
        if line.startswith("#"):
            directive, _, value = line[1:].partition(" ")
            if not value:
                directive, _, value = directive.partition("\t")
            if directive == "separator":
                header["separator"] = _decode_separator(value.strip())
            elif directive == "fields":
                field_names = value.split("\t")
            elif directive == "path":
                header["path"] = value.strip()
            continue
        rows.append(line)
    header["fields"] = field_names
    separator: str = header["separator"]
    records = [dict(zip(field_names, row.split(separator))) for row in rows if field_names]
    return header, records


def notice_record_to_event(
    record: dict[str, str], *, raw_source: str = "zeek"
) -> Optional[dict[str, Any]]:
    """Convert one ``notice.log`` record to a ``SecurityEvent``, or ``None`` if unusable."""
    epoch = _parse_epoch(_clean(record.get("ts")))
    if epoch is None:
        return None
    note = _clean(record.get("note"))
    event_type, severity, mitre = classify_notice(note)
    description = _clean(record.get("msg")) or note
    return make_event(
        event_type=event_type,
        severity=severity,
        ts=iso_utc(epoch),
        src={"ip": _clean(record.get("src")) or _clean(record.get("id.orig_h"))},
        dst={"ip": _clean(record.get("dst")) or _clean(record.get("id.resp_h"))},
        description=description,
        raw_source=raw_source,
        mitre=mitre,
        meta={
            "note": note,
            "uid": _clean(record.get("uid")),
            "sub": _clean(record.get("sub")),
            "proto": _clean(record.get("proto")),
        },
    )


def parse_notice_log(raw: str, *, raw_source: str = "zeek") -> list[dict[str, Any]]:
    """Parse the text of a Zeek ``notice.log`` into ``SecurityEvent`` dicts.

    Empty input yields an empty list. A log without a ``#fields`` header is not a Zeek
    TSV file and raises ``ValueError`` — that is a programmer error, not bad telemetry.
    """
    if not raw.strip():
        return []
    header, records = read_tsv(raw)
    if not header["fields"]:
        raise ValueError("not a Zeek TSV log: missing #fields header")
    events: list[dict[str, Any]] = []
    for record in records:
        event = notice_record_to_event(record, raw_source=raw_source)
        if event is not None:
            events.append(event)
    return events


def _parse_epoch(value: Optional[str]) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except ValueError:
        return None
