"""Fixture tests for the Suricata ``eve.json`` adapter (raw NDJSON -> SecurityEvent)."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import pytest

from app.ingest.base import CONTRACT_KEYS
from app.ingest.suricata import (
    parse_eve_json,
    severity_for_level,
    type_for_category,
)

FIXTURE = Path(__file__).parent / "fixtures" / "suricata" / "eve.json"


def fixture_text() -> str:
    return FIXTURE.read_text(encoding="utf-8")


def test_parses_only_alert_records() -> None:
    records = [json.loads(line) for line in fixture_text().splitlines() if line.strip()]
    assert {record["event_type"] for record in records} == {"alert", "dns", "flow"}

    events = parse_eve_json(fixture_text())

    assert len(events) == 3
    assert [event["type"] for event in events] == ["port_scan", "web_attack", "malware"]


def test_events_carry_the_full_contract_shape() -> None:
    for event in parse_eve_json(fixture_text()):
        assert tuple(event) == CONTRACT_KEYS
        assert set(event["src"]) == {"ip", "host", "asset_id"}
        assert set(event["dst"]) == {"ip", "host", "asset_id"}
        assert event["src"]["host"] is None and event["src"]["asset_id"] is None
        assert event["raw_source"] == "suricata"
        assert event["ts"].endswith("Z")
        datetime.fromisoformat(event["ts"].replace("Z", "+00:00"))


def test_maps_categories_severity_endpoints_and_meta() -> None:
    scan, web, trojan = parse_eve_json(fixture_text())

    assert scan["severity"] == "medium"
    assert scan["src"]["ip"] == "203.0.113.44"
    assert scan["dst"]["ip"] == "10.10.4.21"
    assert scan["description"] == "ET SCAN NMAP -sS window 1024"
    assert scan["meta"] == {
        "flow_id": 1482234412345678,
        "signature_id": 2000537,
        "category": "Detection of a Network Scan",
        "rev": 11,
        "proto": "TCP",
        "app_proto": "http",
    }

    assert web["severity"] == "high"
    assert web["dst"]["ip"] == "10.10.4.21"
    assert trojan["severity"] == "high"
    assert trojan["dst"]["ip"] == "10.20.0.5"


def test_rule_metadata_wins_over_the_default_mapping() -> None:
    scan, web, trojan = parse_eve_json(fixture_text())

    assert scan["mitre"] == {
        "tactic": "discovery",
        "technique_id": "T1046",
        "technique": "Network Service Discovery",
    }
    # "Initial Access" is normalised to the contract's kebab-case tactic style.
    assert web["mitre"] == {
        "tactic": "initial-access",
        "technique_id": "T1190",
        "technique": "Exploit Public-Facing Application",
    }
    # No rule metadata: fall back to the type's default ATT&CK attribution.
    assert trojan["mitre"] == {
        "tactic": "execution",
        "technique_id": "T1204",
        "technique": "User Execution",
    }


def test_timestamps_are_normalised_to_utc_milliseconds() -> None:
    events = parse_eve_json(fixture_text())

    assert events[0]["ts"] == "2026-11-10T09:14:22.481Z"


def test_non_utc_offsets_are_converted() -> None:
    raw = (
        '{"timestamp":"2026-11-10T12:14:22.481234+0300","event_type":"alert",'
        '"src_ip":"203.0.113.44","dest_ip":"10.10.4.21",'
        '"alert":{"signature":"x","category":"Misc activity","severity":3}}'
    )
    assert parse_eve_json(raw)[0]["ts"] == "2026-11-10T09:14:22.481Z"


def test_malformed_and_partial_lines_are_skipped() -> None:
    raw = "\n".join(
        [
            '{"timestamp":"2026-11-10T09:14:22.481234+0000","event_type":"alert"',
            '["not","an","object"]',
            "null",
            "42",
            "",
            "   ",
            fixture_text().splitlines()[0],
        ]
    )
    events = parse_eve_json(raw)
    assert len(events) == 1
    assert events[0]["type"] == "port_scan"


def test_empty_input_is_not_an_error() -> None:
    assert parse_eve_json("") == []
    assert parse_eve_json("\n  \n") == []


def test_alert_without_a_timestamp_is_skipped() -> None:
    raw = (
        '{"event_type":"alert","src_ip":"203.0.113.44",'
        '"alert":{"signature":"x","category":"Misc activity","severity":1}}'
    )
    assert parse_eve_json(raw) == []


def test_alert_without_a_signature_falls_back_to_the_category() -> None:
    raw = (
        '{"timestamp":"2026-11-10T09:14:22.481234+0000","event_type":"alert",'
        '"alert":{"category":"Web Application Attack","severity":2}}'
    )
    event = parse_eve_json(raw)[0]
    assert event["description"] == "Web Application Attack"
    assert event["type"] == "web_attack"


def test_unknown_category_degrades_to_other_without_attack_metadata() -> None:
    raw = (
        '{"timestamp":"2026-11-10T09:14:22.481234+0000","event_type":"alert",'
        '"alert":{"signature":"x","category":"Brand New Category","severity":3}}'
    )
    event = parse_eve_json(raw)[0]
    assert event["type"] == "other"
    assert event["severity"] == "low"
    assert event["mitre"] is None


def test_technique_without_a_tactic_is_dropped() -> None:
    raw = (
        '{"timestamp":"2026-11-10T09:14:22.481234+0000","event_type":"alert",'
        '"alert":{"signature":"x","category":"Brand New Category","severity":2,'
        '"metadata":{"mitre_technique_id":["T9999"]}}}'
    )
    assert parse_eve_json(raw)[0]["mitre"] is None


def test_raw_source_can_be_overridden() -> None:
    events = parse_eve_json(fixture_text(), raw_source="suricata-eve")
    assert {event["raw_source"] for event in events} == {"suricata-eve"}


def test_event_ids_are_unique_ulids() -> None:
    events = parse_eve_json(fixture_text())
    ids = [event["id"] for event in events]
    assert len(set(ids)) == len(ids)
    for event_id in ids:
        assert len(event_id) == 26
        assert set(event_id) <= set("0123456789ABCDEFGHJKMNPQRSTVWXYZ")


@pytest.mark.parametrize(
    ("level", "expected"),
    [
        (1, "high"),
        (2, "medium"),
        (3, "low"),
        (4, "info"),
        (0, "info"),
        (None, "info"),
        ("2", "medium"),
    ],
)
def test_severity_levels(level: object, expected: str) -> None:
    assert severity_for_level(level) == expected


@pytest.mark.parametrize(
    ("category", "expected"),
    [
        ("Detection of a Network Scan", "port_scan"),
        ("Web Application Attack", "web_attack"),
        ("Attempted Denial of Service", "ddos"),
        ("Credential Theft", "credential_attack"),
        ("Information Leak", "data_exfiltration"),
        ("Command and Control", "c2_beacon"),
        ("Potential Corporate Privacy Violation", "policy_violation"),
        ("Misc activity", "anomaly"),
        ("  misc activity  ", "anomaly"),
        ("Something Else", "other"),
        (None, "other"),
        ("", "other"),
    ],
)
def test_category_mapping(category: object, expected: str) -> None:
    assert type_for_category(category) == expected
