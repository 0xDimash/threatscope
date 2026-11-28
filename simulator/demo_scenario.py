"""Deterministic demo scenario for the defence: a 60 s municipal intrusion.

Fixed seed, fixed base time, fixed event ids, so the output is byte-identical on every run.
Targets are inventory assets that exist as devices in the room (see
``frontend/src/scene/roomMap.ts``), so every arc lands on a real device.

    python3 simulator/demo_scenario.py            # print to stdout
    python3 simulator/demo_scenario.py --out simulator/scenarios/defence-demo.json \
        --out frontend/src/ui/demoScenario.json   # write the same bytes to both copies
    python3 simulator/demo_scenario.py --check simulator/scenarios/defence-demo.json
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

SEED = 20260312
BASE = datetime(2026, 3, 12, 9, 0, 0, tzinfo=timezone.utc)
DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "assets.json"

ATTACKS: dict[str, dict[str, str]] = {
    "recon": {"severity": "low", "tactic": "reconnaissance", "id": "T1595", "name": "Active Scanning"},
    "port_scan": {"severity": "low", "tactic": "discovery", "id": "T1046", "name": "Network Service Discovery"},
    "phishing": {"severity": "medium", "tactic": "initial-access", "id": "T1566", "name": "Phishing"},
    "web_attack": {"severity": "medium", "tactic": "initial-access", "id": "T1190", "name": "Exploit Public-Facing Application"},
    "credential_attack": {"severity": "high", "tactic": "credential-access", "id": "T1110", "name": "Brute Force"},
    "c2_beacon": {"severity": "high", "tactic": "command-and-control", "id": "T1071", "name": "Application Layer Protocol"},
    "lateral_movement": {"severity": "high", "tactic": "lateral-movement", "id": "T1021", "name": "Remote Services"},
    "data_exfiltration": {"severity": "critical", "tactic": "exfiltration", "id": "T1041", "name": "Exfiltration Over C2 Channel"},
    "ransomware": {"severity": "critical", "tactic": "impact", "id": "T1486", "name": "Data Encrypted for Impact"},
}
RISK = {"info": 0.5, "low": 1.0, "medium": 3.0, "high": 6.0, "critical": 10.0}

# (offset seconds, attack type, target asset id, source asset id or None for an external source)
# Offsets are fixed on purpose: the scenario is a script, not a sample.
SCRIPT: list[tuple[float, str, str, str | None]] = [
    (1.0, "recon", "asset-egov-portal", None),
    (2.5, "port_scan", "asset-egov-portal", None),
    (4.0, "recon", "asset-open-data-portal", None),
    (5.5, "port_scan", "asset-egov-gateway", None),
    (7.0, "web_attack", "asset-open-data-portal", None),
    (9.0, "phishing", "asset-akimat-portal", None),
    (10.5, "phishing", "asset-akimat-portal", None),
    (12.0, "phishing", "asset-egov-portal", None),
    (14.0, "credential_attack", "asset-akimat-portal", None),
    (15.0, "credential_attack", "asset-akimat-portal", None),
    (16.0, "credential_attack", "asset-akimat-portal", None),
    (18.0, "c2_beacon", "asset-akimat-portal", None),
    (20.0, "c2_beacon", "asset-akimat-portal", None),
    (22.0, "c2_beacon", "asset-akimat-portal", None),
    (24.0, "lateral_movement", "asset-egov-gateway", "asset-akimat-portal"),
    (25.5, "lateral_movement", "asset-egov-gateway", "asset-akimat-portal"),
    (27.0, "lateral_movement", "asset-municipal-dc", "asset-egov-gateway"),
    (28.5, "credential_attack", "asset-municipal-dc", "asset-egov-gateway"),
    (30.0, "lateral_movement", "asset-municipal-dc", "asset-egov-gateway"),
    (32.0, "lateral_movement", "asset-citizen-registry-db", "asset-municipal-dc"),
    (33.5, "lateral_movement", "asset-cctv-network", "asset-municipal-dc"),
    (35.0, "c2_beacon", "asset-municipal-dc", None),
    (37.0, "data_exfiltration", "asset-citizen-registry-db", None),
    (38.0, "data_exfiltration", "asset-citizen-registry-db", None),
    (39.0, "data_exfiltration", "asset-citizen-registry-db", None),
    (40.5, "data_exfiltration", "asset-municipal-dc", None),
    (42.0, "c2_beacon", "asset-transit-onay", "asset-municipal-dc"),
    (44.0, "ransomware", "asset-citizen-registry-db", "asset-municipal-dc"),
    (45.0, "ransomware", "asset-municipal-dc", None),
    (46.0, "ransomware", "asset-citizen-registry-db", "asset-municipal-dc"),
    (47.0, "ransomware", "asset-egov-gateway", "asset-municipal-dc"),
    (48.0, "ransomware", "asset-akimat-portal", "asset-municipal-dc"),
    (49.0, "ransomware", "asset-egov-portal", "asset-municipal-dc"),
    (50.5, "ransomware", "asset-cctv-network", "asset-municipal-dc"),
    (52.0, "ransomware", "asset-transit-onay", "asset-municipal-dc"),
    (54.0, "port_scan", "asset-egov-gateway", None),
    (56.0, "c2_beacon", "asset-municipal-dc", None),
    (58.0, "recon", "asset-open-data-portal", None),
    (60.0, "c2_beacon", "asset-akimat-portal", None),
]


def _host(name: str) -> str:
    host = "".join(c if c.isalnum() else "-" for c in name.lower()).strip("-")
    while "--" in host:
        host = host.replace("--", "-")
    return host


def _inventory() -> dict[str, dict[str, str]]:
    items = json.loads(DATA_FILE.read_text(encoding="utf-8"))["assets"]
    return {i["id"]: {"ip": i["ip"], "host": _host(i["name"])} for i in items if i.get("ip")}


def _iso(moment: datetime) -> str:
    return moment.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def build(seed: int = SEED) -> dict[str, Any]:
    rng = random.Random(seed)
    assets = _inventory()
    attacker_ips = [f"203.0.113.{rng.randint(2, 254)}" for _ in range(4)]
    events: list[dict[str, Any]] = []
    for index, (offset, kind, target_id, source_id) in enumerate(SCRIPT, start=1):
        attack = ATTACKS[kind]
        target = assets[target_id]
        if source_id is None:
            src = {"ip": attacker_ips[rng.randrange(len(attacker_ips))], "host": None, "asset_id": None}
        else:
            src = {"ip": assets[source_id]["ip"], "host": assets[source_id]["host"], "asset_id": source_id}
        events.append(
            {
                "id": f"demo-{index:04d}",
                "ts": _iso(BASE + timedelta(seconds=offset)),
                "type": kind,
                "severity": attack["severity"],
                "src": src,
                "dst": {"ip": target["ip"], "host": target["host"], "asset_id": target_id},
                "description": f"{kind} against {target['host']}",
                "mitre": {"tactic": attack["tactic"], "technique_id": attack["id"], "technique": attack["name"]},
                "risk_delta": RISK[attack["severity"]],
                "raw_source": "demo-scenario",
                "meta": {},
            }
        )
    return {
        "name": "defence-demo",
        "description": "Municipal intrusion: recon, phishing, C2, lateral movement, exfiltration, ransomware.",
        "seed": seed,
        "events": events,
    }


def render(seed: int = SEED) -> str:
    return json.dumps(build(seed), indent=2, ensure_ascii=False) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Deterministic defence demo scenario")
    parser.add_argument("--out", action="append", default=[], help="write here (repeatable)")
    parser.add_argument("--check", action="append", default=[], help="fail if this file differs")
    args = parser.parse_args()
    text = render()
    status = 0
    for path in args.check:
        if Path(path).read_text(encoding="utf-8") != text:
            print(f"stale: {path}", file=sys.stderr)
            status = 1
    for path in args.out:
        Path(path).write_text(text, encoding="utf-8")
    if not args.out and not args.check:
        sys.stdout.write(text)
    return status


if __name__ == "__main__":
    raise SystemExit(main())
