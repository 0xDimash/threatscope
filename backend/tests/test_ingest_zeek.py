"""Fixture tests for the Zeek ``notice.log`` adapter (raw text -> SecurityEvent)."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import pytest

from app.ingest.base import (
    CONTRACT_KEYS,
    SEVERITIES,
    iso_utc,
    make_event,
    new_ulid,
    risk_delta_for,
)
from app.ingest.zeek import classify_notice, parse_notice_log, read_tsv

FIXTURE = Path(__file__).parent / "fixtures" / "zeek" / "notice.log"


def fixture_text() -> str:
    return FIXTURE.read_text(encoding="utf-8")


def test_parses_every_notice_row() -> None:
    events = parse_notice_log(fixture_text())

    assert len(events) == 4
    assert [event["type"] for event in events] == [
        "port_scan",
        "credential_attack",
        "web_attack",
        "other",
    ]
    assert [event["severity"] for event in events] == ["medium", "high", "high", "info"]


def test_events_carry_the_full_contract_shape() -> None:
    for event in parse_notice_log(fixture_text()):
        assert tuple(event) == CONTRACT_KEYS
        assert set(event["src"]) == {"ip", "host", "asset_id"}
        assert set(event["dst"]) == {"ip", "host", "asset_id"}
        assert event["src"]["host"] is None and event["src"]["asset_id"] is None
        assert event["raw_source"] == "zeek"
        assert event["ts"].endswith("Z")
        datetime.fromisoformat(event["ts"].replace("Z", "+00:00"))


def test_maps_notices_to_types_severity_and_attack() -> None:
    port_scan, brute_force, sql_injection, unknown = parse_notice_log(fixture_text())

    assert port_scan["src"]["ip"] == "203.0.113.44"
    assert port_scan["dst"]["ip"] == "10.10.4.21"
    assert port_scan["description"] == "203.0.113.44 swept 1-1024/tcp on egov-portal"
    assert port_scan["mitre"] == {
        "tactic": "discovery",
        "technique_id": "T1046",
        "technique": "Network Service Discovery",
    }

    assert brute_force["mitre"]["technique_id"] == "T1110"
    assert sql_injection["type"] == "web_attack"
    assert sql_injection["mitre"]["technique_id"] == "T1190"

    # Unknown notices degrade to "other"/"info" and never inflate risk.
    assert unknown["mitre"] is None
    assert unknown["risk_delta"] == 0.0
    assert port_scan["risk_delta"] == 4.0
    assert brute_force["risk_delta"] == 10.0


def test_timestamp_and_event_ids_are_contract_safe() -> None:
    events = parse_notice_log(fixture_text())

    assert events[0]["ts"] == iso_utc(1794302062.481)
    ids = [event["id"] for event in events]
    assert len(set(ids)) == len(ids)
    for event_id in ids:
        assert len(event_id) == 26
        assert event_id == event_id.upper()
        assert set(event_id) <= set("0123456789ABCDEFGHJKMNPQRSTVWXYZ")


def test_escaped_characters_are_unescaped() -> None:
    raw = (
        "#separator \\x09\n"
        "#fields\tts\tnote\tmsg\n"
        "#types\ttime\tenum\tstring\n"
        "1794302062.481\tScan::Port_Scan\t203.0.113.44\\x09swept\\x2c1-1024\n"
    )
    event = parse_notice_log(raw)[0]
    assert event["description"] == "203.0.113.44\tswept,1-1024"


def test_escaped_unset_tokens_stay_values() -> None:
    raw = (
        "#separator \\x09\n"
        "#fields\tts\tnote\tmsg\n"
        "#types\ttime\tenum\tstring\n"
        "1794302062.481\tScan::Port_Scan\t\\x2d\n"
    )
    event = parse_notice_log(raw)[0]
    assert event["description"] == "-"


def test_unset_and_empty_fields_become_nulls() -> None:
    unknown = parse_notice_log(fixture_text())[-1]

    assert unknown["meta"] == {
        "note": "Something::Unexpected",
        "uid": "C2mNb4vC6xZ8aS3dF",
        "sub": None,
        "proto": None,
    }
    # description falls back to the notice name when msg is unset.
    assert unknown["description"] == "Something::Unexpected"
    # src/dst fall back to the flow endpoints when the notice-only columns are unset.
    assert unknown["src"]["ip"] == "203.0.113.44"
    assert unknown["dst"]["ip"] == "10.10.5.9"


def test_raw_source_can_be_overridden() -> None:
    events = parse_notice_log(fixture_text(), raw_source="zeek-notice")
    assert {event["raw_source"] for event in events} == {"zeek-notice"}


def test_empty_input_is_not_an_error() -> None:
    assert parse_notice_log("") == []
    assert parse_notice_log("  \n\t\n") == []


def test_missing_fields_header_raises() -> None:
    with pytest.raises(ValueError, match="missing #fields"):
        parse_notice_log("1794302062.481\tfoo\tbar\n")


def test_rows_without_a_timestamp_are_skipped() -> None:
    raw = (
        "#separator \\x09\n"
        "#fields\tts\tnote\n"
        "#types\ttime\tenum\tstring\n"
        "-\tScan::Port_Scan\n"
        "1794302062.481\tScan::Port_Scan\n"
    )
    events = parse_notice_log(raw)
    assert len(events) == 1
    assert events[0]["type"] == "port_scan"


def test_separator_directive_is_decoded() -> None:
    header, records = read_tsv(fixture_text())
    assert header["separator"] == "\t"
    assert header["path"] == "notice"
    assert records[0]["note"] == "Scan::Port_Scan"


def test_classify_notice_prefers_the_longest_prefix() -> None:
    assert classify_notice("Scan::Port_Scan_Extended")[0] == "port_scan"
    assert classify_notice("SSH::Bruteforce")[1] == "high"
    assert classify_notice(None) == ("other", "info", None)
    assert classify_notice("Totally::Unknown_Note") == ("other", "info", None)


def test_risk_delta_is_monotonic_and_unknowns_are_free() -> None:
    deltas = [risk_delta_for(severity) for severity in SEVERITIES]
    assert deltas == sorted(deltas)
    assert risk_delta_for("not-a-severity") == 0.0


def test_ulids_sort_by_time() -> None:
    assert new_ulid(1_700_000_000.0) < new_ulid(1_700_000_001.0)
    assert len(new_ulid()) == 26


def test_make_event_defaults_every_missing_field_to_null() -> None:
    event = make_event(
        event_type="other",
        severity="info",
        ts="2026-11-10T09:14:22.481Z",
        src={"ip": "203.0.113.44"},
        dst={},
        raw_source="test",
    )

    assert tuple(event) == CONTRACT_KEYS
    assert event["src"] == {"ip": "203.0.113.44", "host": None, "asset_id": None}
    assert event["dst"] == {"ip": None, "host": None, "asset_id": None}
    assert event["description"] is None
    assert event["mitre"] is None
    assert event["risk_delta"] == 0.0
    assert event["meta"] == {}
    assert datetime.fromisoformat(event["ts"].replace("Z", "+00:00")).tzinfo == timezone.utc
