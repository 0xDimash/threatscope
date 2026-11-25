"""Syslog adapter: RFC 3164 / RFC 5424 lines -> normalised ``SecurityEvent`` objects.

The parser is pure: ``raw -> list[SecurityEvent]``. It never touches the database or the
network. Unrecognised or malformed lines are skipped, never raised — one bad line in a
forwarded stream must not drop the rest of the batch.

Supported patterns (see ``docs/threat-model.md`` for the full table):

- sshd "Failed password" / "Invalid user"      -> credential_attack, high, T1110
- sshd "Accepted password/publickey" after a
  prior failure from the same IP                -> credential_attack, high, T1110
- iptables / ufw BLOCK|DROP with many dst ports
  from one source                               -> port_scan, medium, T1046
- sudo / su authentication failures            -> credential_attack, low, T1110
"""

from __future__ import annotations

import re
from contextlib import suppress
from datetime import datetime, timezone
from typing import Any, Optional

from app.ingest.base import iso_utc, make_event

# RFC 5424: <PRI>VER SP TIMESTAMP HOSTNAME APP PROCID MSGID SD MSG
_RFC5424_RE = re.compile(
    r"^(?:<\d+>)?"  # optional PRI
    r"(?P<ver>\d+)\s+"
    r"(?P<ts>\S+)\s+"
    r"(?P<host>\S+)\s+"
    r"(?P<app>\S+)\s+"
    r"(?P<proc>\S+)\s+"
    r"(?P<msgid>\S+)\s+"
    r"(?P<sd>-|\[[^\]]*(?:\][^\[]*\[[^\]]*)*\])\s*"
    r"(?P<msg>.*)$"
)

# RFC 3164: <PRI>MMM DD HH:MM:SS HOST APP[PID]: MSG  (no year)
_RFC3164_RE = re.compile(
    r"^(?:<\d+>)?"
    r"(?P<month>[A-Z][a-z]{2})\s+"
    r"(?P<day>\d{1,2})\s+"
    r"(?P<time>\d{2}:\d{2}:\d{2})\s+"
    r"(?P<host>\S+)\s+"
    r"(?P<tag>[^:\[]+)(?:\[\d+\])?:\s*"
    r"(?P<msg>.*)$"
)

_MONTHS = {
    "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
    "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12,
}

_SSHD_FAILED = re.compile(
    r"(?:Failed password|Invalid user)\s+(?:\S+\s+)?(?:for\s+)?(?:invalid user\s+)?(?P<user>\S+)\s+"
    r"from\s+(?P<ip>[0-9a-fA-F:.]+)",
    re.IGNORECASE,
)
_SSHD_INVALID_USER = re.compile(
    r"Invalid user\s+(?P<user>\S+)\s+from\s+(?P<ip>[0-9a-fA-F:.]+)",
    re.IGNORECASE,
)
_SSHD_ACCEPTED = re.compile(
    r"Accepted\s+(?:password|publickey)\s+for\s+(?P<user>\S+)\s+"
    r"from\s+(?P<ip>[0-9a-fA-F:.]+)",
    re.IGNORECASE,
)
_SUDO_FAIL = re.compile(
    r"(?P<user>\S+)\s*:.*(?:authentication failure|incorrect password|password attempts)",
    re.IGNORECASE,
)
_SU_FAIL = re.compile(
    r"(?:FAILED su|authentication failure).*(?:user=|for\s+)(?P<user>\S+)",
    re.IGNORECASE,
)
_FW_BLOCK = re.compile(
    r"\b(?:UFW BLOCK|BLOCK|DROP)\b.*?\bSRC=(?P<src>[0-9a-fA-F:.]+)\b"
    r".*?\bDST=(?P<dst>[0-9a-fA-F:.]+)\b.*?\bDPT=(?P<dpt>\d+)\b",
    re.IGNORECASE,
)
_FW_BLOCK_ALT = re.compile(
    r"\b(?:UFW BLOCK|BLOCK|DROP)\b.*?\bSRC=(?P<src>[0-9a-fA-F:.]+)\b"
    r".*?\bDPT=(?P<dpt>\d+)\b.*?\bDST=(?P<dst>[0-9a-fA-F:.]+)\b",
    re.IGNORECASE,
)

_PORT_SCAN_THRESHOLD = 5


def parse_syslog(raw: str, *, raw_source: str = "syslog") -> list[dict[str, Any]]:
    """Parse RFC 3164 / RFC 5424 syslog text into ``SecurityEvent`` dicts."""
    if not raw or not raw.strip():
        return []

    events: list[dict[str, Any]] = []
    failed_ssh_ips: set[str] = set()
    fw_ports: dict[tuple[str, str], set[str]] = {}

    for line in raw.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        parsed = _parse_line(stripped)
        if parsed is None:
            continue
        ts, host, app, msg = parsed
        app_l = (app or "").lower()
        host_clean = _clean_host(host)

        # sshd failures
        if "sshd" in app_l:
            m = _SSHD_FAILED.search(msg) or _SSHD_INVALID_USER.search(msg)
            if m:
                ip = m.group("ip")
                user = m.groupdict().get("user")
                failed_ssh_ips.add(ip)
                events.append(
                    make_event(
                        event_type="credential_attack",
                        severity="high",
                        ts=ts,
                        src={"ip": ip},
                        dst={"host": host_clean},
                        description=(
                            f"sshd authentication failure for {user or 'unknown'} from {ip}"
                        ),
                        raw_source=raw_source,
                        mitre={
                            "tactic": "credential-access",
                            "technique_id": "T1110",
                            "technique": "Brute Force",
                        },
                        meta={"app": app, "user": user, "kind": "sshd_failed"},
                    )
                )
                continue

            m = _SSHD_ACCEPTED.search(msg)
            if m:
                ip = m.group("ip")
                user = m.group("user")
                if ip in failed_ssh_ips:
                    events.append(
                        make_event(
                            event_type="credential_attack",
                            severity="high",
                            ts=ts,
                            src={"ip": ip},
                            dst={"host": host_clean},
                            description=(
                                f"sshd accepted login for {user} from {ip} after prior failures"
                            ),
                            raw_source=raw_source,
                            mitre={
                                "tactic": "credential-access",
                                "technique_id": "T1110",
                                "technique": "Brute Force",
                            },
                            meta={"app": app, "user": user, "kind": "sshd_accepted_after_failure"},
                        )
                    )
                # Accepted login with no prior failure in this batch is not a threat signal.
                continue

        # sudo / su failures
        if app_l in {"sudo", "su"} or "sudo" in msg.lower() or msg.startswith("FAILED su"):
            user = _extract_auth_user(app_l, msg)
            is_failure = bool(
                re.search(
                    r"authentication failure|incorrect password|FAILED su|password attempts",
                    msg,
                    re.IGNORECASE,
                )
            )
            if is_failure:
                events.append(
                    make_event(
                        event_type="credential_attack",
                        severity="low",
                        ts=ts,
                        src={"host": host_clean},
                        dst={"host": host_clean},
                        description=(
                            f"{app_l or 'auth'} authentication failure"
                            + (f" for {user}" if user else "")
                        ),
                        raw_source=raw_source,
                        mitre={
                            "tactic": "credential-access",
                            "technique_id": "T1110",
                            "technique": "Brute Force",
                        },
                        meta={"app": app, "user": user, "kind": "sudo_su_failure"},
                    )
                )
                continue

        # firewall blocks / drops
        fw = _FW_BLOCK.search(msg) or _FW_BLOCK_ALT.search(msg)
        if fw:
            src_ip = fw.group("src")
            dst_ip = fw.group("dst")
            dpt = fw.group("dpt")
            key = (src_ip, dst_ip)
            ports = fw_ports.setdefault(key, set())
            ports.add(dpt)
            # Emit a port_scan event when threshold is crossed; emit once per source/dst.
            if len(ports) == _PORT_SCAN_THRESHOLD:
                events.append(
                    make_event(
                        event_type="port_scan",
                        severity="medium",
                        ts=ts,
                        src={"ip": src_ip},
                        dst={"ip": dst_ip, "host": host_clean},
                        description=(
                            f"Firewall blocked traffic from {src_ip} to {dst_ip} "
                            f"across {len(ports)} destination ports"
                        ),
                        raw_source=raw_source,
                        mitre={
                            "tactic": "discovery",
                            "technique_id": "T1046",
                            "technique": "Network Service Discovery",
                        },
                        meta={
                            "app": app,
                            "kind": "firewall_port_scan",
                            "ports_seen": sorted(ports, key=int),
                        },
                    )
                )
            continue

    return events


def _parse_line(line: str) -> Optional[tuple[str, Optional[str], Optional[str], str]]:
    """Return (iso_ts, host, app, msg) or None if the line cannot be parsed."""
    m = _RFC5424_RE.match(line)
    if m and m.group("ver") == "1":
        ts = _parse_rfc5424_ts(m.group("ts"))
        if ts is None:
            return None
        app = m.group("app")
        if app == "-":
            app = None
        return ts, m.group("host"), app, m.group("msg")

    m = _RFC3164_RE.match(line)
    if m:
        ts = _parse_rfc3164_ts(m.group("month"), m.group("day"), m.group("time"))
        if ts is None:
            return None
        return ts, m.group("host"), m.group("tag"), m.group("msg")

    return None


def _parse_rfc5424_ts(value: str) -> Optional[str]:
    if not value or value == "-":
        return None
    text = value
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    # RFC3339 allows fractional seconds of any length and timezone offsets like +00:00
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        # Try trimming nanoseconds to microseconds
        m = re.match(r"^(.*\.\d{6})\d+([+-].*|Z)?$", value)
        if not m:
            return None
        tail = m.group(2) or "+00:00"
        if tail == "Z":
            tail = "+00:00"
        try:
            dt = datetime.fromisoformat(m.group(1) + tail)
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    dt = dt.astimezone(timezone.utc)
    return iso_utc(dt.timestamp())


def _parse_rfc3164_ts(month: str, day: str, clock: str) -> Optional[str]:
    month_num = _MONTHS.get(month)
    if month_num is None:
        return None
    try:
        day_num = int(day)
        parts = [int(p) for p in clock.split(":")]
        if len(parts) != 3:
            return None
        hour, minute, second = parts
    except ValueError:
        return None

    now = datetime.now(timezone.utc)
    year = now.year
    try:
        dt = datetime(year, month_num, day_num, hour, minute, second, tzinfo=timezone.utc)
    except ValueError:
        return None
    # If the timestamp appears to be in the future, assume previous year.
    if dt.timestamp() - now.timestamp() > 86400:
        with suppress(ValueError):
            dt = dt.replace(year=year - 1)
    return iso_utc(dt.timestamp())


def _clean_host(host: Optional[str]) -> Optional[str]:
    if not host or host == "-":
        return None
    return host


def _extract_auth_user(app_l: str, msg: str) -> Optional[str]:
    """Best-effort user extraction for sudo/su failure lines."""
    # su: "FAILED su for root by alice"
    m = re.search(r"FAILED su for\s+(?P<user>\S+)", msg, re.IGNORECASE)
    if m:
        return m.group("user")
    # sudo classic: "   bob : 3 incorrect password attempts ..."
    m = re.search(
        r"^\s*(?P<user>[A-Za-z0-9_.-]+)\s*:\s+\d+\s+incorrect password",
        msg,
        re.IGNORECASE,
    )
    if m:
        return m.group("user")
    # pam-style key=value
    m = re.search(r"\buser=(?P<user>[A-Za-z0-9_.-]+)", msg)
    if m:
        return m.group("user")
    # "for <user>"
    m = re.search(r"\bfor\s+(?:invalid user\s+)?(?P<user>[A-Za-z0-9_.-]+)", msg, re.IGNORECASE)
    if m and m.group("user").lower() not in {"user", "rootby"}:
        return m.group("user")
    return None
