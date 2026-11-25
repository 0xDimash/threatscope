"""Fixture tests for the syslog adapter (RFC 3164 / RFC 5424 -> SecurityEvent)."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

import pytest

from app.ingest.base import CONTRACT_KEYS
from app.ingest.syslog import parse_syslog

FIXTURE = Path(__file__).parent / "fixtures" / "syslog" / "auth.log"


def fixture_text() -> str:
    return FIXTURE.read_text(encoding="utf-8")


def test_parses_fixture_into_contract_events() -> None:
    events = parse_syslog(fixture_text())
    assert len(events) == 13
    assert {e["raw_source"] for e in events} == {"syslog"}


def test_every_event_has_full_contract_shape() -> None:
    for event in parse_syslog(fixture_text()):
        assert tuple(event) == CONTRACT_KEYS
        assert set(event["src"]) == {"ip", "host", "asset_id"}
        assert set(event["dst"]) == {"ip", "host", "asset_id"}
        assert event["ts"].endswith("Z")
        datetime.fromisoformat(event["ts"].replace("Z", "+00:00"))
        assert event["id"]
        assert len(event["id"]) == 26


def test_sshd_failed_password_and_invalid_user_are_high_credential_attacks() -> None:
    events = [e for e in parse_syslog(fixture_text()) if e["meta"].get("kind") == "sshd_failed"]
    assert len(events) == 5
    assert all(e["type"] == "credential_attack" for e in events)
    assert all(e["severity"] == "high" for e in events)
    assert all(e["mitre"]["technique_id"] == "T1110" for e in events)
    assert {e["src"]["ip"] for e in events} == {"203.0.113.44", "203.0.113.45", "198.51.100.23"}


def test_sshd_accepted_after_prior_failure_is_reported() -> None:
    events = [
        e for e in parse_syslog(fixture_text())
        if e["meta"].get("kind") == "sshd_accepted_after_failure"
    ]
    assert len(events) == 2
    ips = {e["src"]["ip"] for e in events}
    assert ips == {"203.0.113.44", "203.0.113.45"}
    assert all(e["severity"] == "high" for e in events)
    assert all(e["type"] == "credential_attack" for e in events)
    assert all("after prior failures" in e["description"] for e in events)


def test_sshd_accepted_without_prior_failure_is_skipped() -> None:
    raw = (
        "<165>1 2026-11-10T09:15:00.000Z bastion sshd 3333 - - "
        "Accepted publickey for deploy from 198.51.100.99 port 60000 ssh2\n"
    )
    assert parse_syslog(raw) == []


def test_sudo_and_su_failures_are_low_credential_attacks() -> None:
    events = [e for e in parse_syslog(fixture_text()) if e["meta"].get("kind") == "sudo_su_failure"]
    assert len(events) == 4
    assert all(e["type"] == "credential_attack" for e in events)
    assert all(e["severity"] == "low" for e in events)
    assert all(e["mitre"] == {
        "tactic": "credential-access",
        "technique_id": "T1110",
        "technique": "Brute Force",
    } for e in events)
    users = {e["meta"]["user"] for e in events}
    assert users == {"bob", "root"}


def test_firewall_block_drop_port_scan_detected() -> None:
    events = [
        e for e in parse_syslog(fixture_text())
        if e["meta"].get("kind") == "firewall_port_scan"
    ]
    assert len(events) == 2
    by_src = {e["src"]["ip"]: e for e in events}
    assert "203.0.113.77" in by_src
    assert "198.51.100.10" in by_src
    for e in events:
        assert e["type"] == "port_scan"
        assert e["severity"] == "medium"
        assert e["mitre"]["technique_id"] == "T1046"
        assert e["dst"]["ip"] is not None


def test_rfc5424_timestamp_is_normalised_to_utc_iso() -> None:
    raw = (
        "<165>1 2026-11-10T09:14:22.481Z bastion sshd 2222 - - "
        "Failed password for root from 203.0.113.44 port 50125 ssh2\n"
    )
    event = parse_syslog(raw)[0]
    assert event["ts"] == "2026-11-10T09:14:22.481Z"


def test_rfc3164_timestamp_becomes_iso_utc() -> None:
    raw = (
        "<34>Oct 11 22:14:15 bastion sshd[1234]: "
        "Failed password for root from 203.0.113.44 port 50122 ssh2\n"
    )
    event = parse_syslog(raw)[0]
    assert event["ts"].endswith("Z")
    # RFC3164 has no year; parser assigns a year. Check month/day/time.
    assert "-10-11T22:14:15.000Z" in event["ts"]
    datetime.fromisoformat(event["ts"].replace("Z", "+00:00"))


def test_malformed_and_junk_lines_are_skipped() -> None:
    raw = "\n".join([
        "THIS IS NOT SYSLOG",
        "<99999>bad line",
        "",
        "   ",
        "{ \"json\": \"not syslog\" }",
        "<34>Oct 11 22:14:15",  # truncated
        "<165>1 not-a-ts host app proc msgid - Failed password for root from 1.2.3.4 port 22 ssh2",
    ])
    assert parse_syslog(raw) == []


def test_empty_input_returns_empty_list() -> None:
    assert parse_syslog("") == []
    assert parse_syslog(" \n\n ") == []


def test_unknown_lines_are_skipped() -> None:
    raw = (
        "<34>Oct 11 22:20:00 bastion sshd[1234]: Connection closed by 10.0.0.1 port 22\n"
        "<13>Nov 10 10:07:00 fw01 kernel: [UFW BLOCK] IN=eth0 "
        "SRC=203.0.113.88 DST=10.10.4.21 PROTO=TCP SPT=3333 DPT=22\n"
    )
    assert parse_syslog(raw) == []


def test_raw_source_can_be_overridden() -> None:
    raw = (
        "<34>Oct 11 22:14:15 bastion sshd[1234]: "
        "Failed password for root from 203.0.113.44 port 50122 ssh2\n"
    )
    event = parse_syslog(raw, raw_source="syslog-auth")[0]
    assert event["raw_source"] == "syslog-auth"


def test_iptables_drop_is_detected_as_port_scan() -> None:
    lines = []
    for i, port in enumerate([22, 23, 25, 53, 110]):
        lines.append(
            f"<165>1 2026-11-10T10:06:0{i}.000Z fw01 iptables 1 - - "
            f"DROP IN=eth0 SRC=198.51.100.10 DST=10.10.1.10 PROTO=TCP SPT=1111 DPT={port}"
        )
    events = parse_syslog("\n".join(lines))
    assert len(events) == 1
    assert events[0]["type"] == "port_scan"
    assert events[0]["src"]["ip"] == "198.51.100.10"


def test_sshd_invalid_user_variant() -> None:
    raw = (
        "<34>Oct 11 22:14:17 bastion sshd[1234]: "
        "Invalid user test from 203.0.113.45 port 50124 ssh2\n"
    )
    event = parse_syslog(raw)[0]
    assert event["type"] == "credential_attack"
    assert event["severity"] == "high"
    assert event["mitre"]["technique_id"] == "T1110"
    assert event["src"]["ip"] == "203.0.113.45"


def test_port_scan_emitted_once_per_source_destination() -> None:
    lines = []
    for i, port in enumerate([22, 23, 25, 53, 110, 143, 443]):
        lines.append(
            f"<13>Nov 10 10:05:0{i} fw01 kernel: [UFW BLOCK] IN=eth0 "
            f"SRC=203.0.113.77 DST=10.10.4.21 PROTO=TCP SPT=45678 DPT={port}"
        )
    events = parse_syslog("\n".join(lines))
    assert len(events) == 1
    assert events[0]["meta"]["kind"] == "firewall_port_scan"


@pytest.mark.parametrize(
    "line",
    [
        (
            "<34>Oct 11 22:14:15 bastion sshd[1234]: "
            "Failed password for root from 203.0.113.44 port 50122 ssh2"
        ),
        (
            "<165>1 2026-11-10T09:14:22.481Z bastion sshd 2222 - - "
            "Failed password for root from 203.0.113.44 port 50125 ssh2"
        ),
    ],
)
def test_both_syslog_formats_parse(line: str) -> None:
    events = parse_syslog(line)
    assert len(events) == 1
    assert events[0]["type"] == "credential_attack"
    assert events[0]["src"]["ip"] == "203.0.113.44"