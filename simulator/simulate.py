"""Synthetic attack feed for demos and integration testing.

Emits SecurityEvents that match docs/api-contract.md and POSTs them to the backend.

    python simulator/simulate.py --rate 2 --duration 60
    python simulator/simulate.py --stdout --count 10
"""

from __future__ import annotations

import argparse
import json
import random
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "assets.json"


def load_assets() -> list[dict[str, Any]]:
    """Targets come from the shared inventory, so every dst.asset_id really exists.

    Only addressable assets (those with an ip) can be attacked; districts and
    inventory groups are map geometry, not hosts.
    """
    try:
        payload = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise SystemExit(f"asset inventory not found: {DATA_FILE}") from exc
    items = payload["assets"] if isinstance(payload, dict) else payload
    assets = []
    for item in items:
        ip = item.get("ip")
        if not ip:
            continue
        host = "".join(c if c.isalnum() else "-" for c in item["name"].lower()).strip("-")
        while "--" in host:
            host = host.replace("--", "-")
        assets.append({"id": item["id"], "ip": ip, "host": host})
    if not assets:
        raise SystemExit(f"no addressable assets in {DATA_FILE}")
    return assets


ASSETS: list[dict[str, Any]] = load_assets()

ATTACKS: list[dict[str, Any]] = [
    {"type": "port_scan", "severity": "low", "tactic": "discovery", "technique_id": "T1046", "technique": "Network Service Discovery"},
    {"type": "recon", "severity": "low", "tactic": "reconnaissance", "technique_id": "T1595", "technique": "Active Scanning"},
    {"type": "phishing", "severity": "medium", "tactic": "initial-access", "technique_id": "T1566", "technique": "Phishing"},
    {"type": "credential_attack", "severity": "high", "tactic": "credential-access", "technique_id": "T1110", "technique": "Brute Force"},
    {"type": "c2_beacon", "severity": "high", "tactic": "command-and-control", "technique_id": "T1071", "technique": "Application Layer Protocol"},
    {"type": "lateral_movement", "severity": "high", "tactic": "lateral-movement", "technique_id": "T1021", "technique": "Remote Services"},
    {"type": "ddos", "severity": "critical", "tactic": "impact", "technique_id": "T1498", "technique": "Network Denial of Service"},
    {"type": "ransomware", "severity": "critical", "tactic": "impact", "technique_id": "T1486", "technique": "Data Encrypted for Impact"},
    {"type": "scada_intrusion", "severity": "critical", "tactic": "impact", "technique_id": "T0831", "technique": "Manipulation of Control"},
    {"type": "data_exfiltration", "severity": "critical", "tactic": "exfiltration", "technique_id": "T1041", "technique": "Exfiltration Over C2 Channel"},
    {"type": "web_attack", "severity": "medium", "tactic": "initial-access", "technique_id": "T1190", "technique": "Exploit Public-Facing Application"},
]

SEVERITY_RISK = {"info": 0.5, "low": 1.0, "medium": 3.0, "high": 6.0, "critical": 10.0}


def make_event() -> dict[str, Any]:
    attack = random.choice(ATTACKS)
    target = random.choice(ASSETS)
    return {
        "id": f"sim-{random.getrandbits(64):016x}",
        "ts": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "type": attack["type"],
        "severity": attack["severity"],
        "src": {"ip": f"203.0.113.{random.randint(2, 254)}", "host": None, "asset_id": None},
        "dst": {"ip": target["ip"], "host": target["host"], "asset_id": target["id"]},
        "description": f"{attack['type']} against {target['host']}",
        "mitre": {
            "tactic": attack["tactic"],
            "technique_id": attack["technique_id"],
            "technique": attack["technique"],
        },
        "risk_delta": SEVERITY_RISK[attack["severity"]],
        "raw_source": "simulator",
        "meta": {},
    }


def post_batch(url: str, events: list[dict[str, Any]]) -> None:
    payload = json.dumps({"events": events}).encode()
    request = urllib.request.Request(
        url, data=payload, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            response.read()
    except urllib.error.URLError as exc:
        print(f"[simulator] backend unreachable: {exc}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="ThreatScope synthetic event feed")
    parser.add_argument("--url", default="http://localhost:8000/api/ingest/batch")
    parser.add_argument("--rate", type=float, default=1.0, help="events per second")
    parser.add_argument("--duration", type=float, default=0.0, help="seconds; 0 = forever")
    parser.add_argument("--count", type=int, default=0, help="fixed number of events")
    parser.add_argument("--stdout", action="store_true", help="print NDJSON instead of POSTing")
    args = parser.parse_args()

    started = time.monotonic()
    sent = 0
    while True:
        event = make_event()
        if args.stdout:
            print(json.dumps(event), flush=True)
        else:
            post_batch(args.url, [event])
        sent += 1
        if args.count and sent >= args.count:
            break
        if args.duration and time.monotonic() - started >= args.duration:
            break
        if not args.stdout:
            time.sleep(1.0 / args.rate)


if __name__ == "__main__":
    main()
