"""Synthetic threat feed for demos, controlled from the UI.

Dev-only: :mod:`app.api.demo` mounts it only when ``DEMO_FEED=1``. It reuses the normal
ingest path (mapping, scoring, broadcast), so what the UI shows is the same pipeline the
real sources feed — only the events are generated.
"""

from __future__ import annotations

import asyncio
import random
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select

from app.api.ws import current_state, manager
from app.core.db import SessionLocal
from app.models.asset import Asset
from app.services import repository

ATTACKS: list[dict[str, str]] = [
    {
        "type": "port_scan",
        "severity": "low",
        "tactic": "discovery",
        "technique_id": "T1046",
        "technique": "Network Service Discovery",
    },
    {
        "type": "recon",
        "severity": "low",
        "tactic": "reconnaissance",
        "technique_id": "T1595",
        "technique": "Active Scanning",
    },
    {
        "type": "phishing",
        "severity": "medium",
        "tactic": "initial-access",
        "technique_id": "T1566",
        "technique": "Phishing",
    },
    {
        "type": "web_attack",
        "severity": "medium",
        "tactic": "initial-access",
        "technique_id": "T1190",
        "technique": "Exploit Public-Facing Application",
    },
    {
        "type": "credential_attack",
        "severity": "high",
        "tactic": "credential-access",
        "technique_id": "T1110",
        "technique": "Brute Force",
    },
    {
        "type": "c2_beacon",
        "severity": "high",
        "tactic": "command-and-control",
        "technique_id": "T1071",
        "technique": "Application Layer Protocol",
    },
    {
        "type": "lateral_movement",
        "severity": "high",
        "tactic": "lateral-movement",
        "technique_id": "T1021",
        "technique": "Remote Services",
    },
    {
        "type": "ddos",
        "severity": "critical",
        "tactic": "impact",
        "technique_id": "T1498",
        "technique": "Network Denial of Service",
    },
    {
        "type": "ransomware",
        "severity": "critical",
        "tactic": "impact",
        "technique_id": "T1486",
        "technique": "Data Encrypted for Impact",
    },
    {
        "type": "scada_intrusion",
        "severity": "critical",
        "tactic": "impact",
        "technique_id": "T0831",
        "technique": "Manipulation of Control",
    },
    {
        "type": "data_exfiltration",
        "severity": "critical",
        "tactic": "exfiltration",
        "technique_id": "T1041",
        "technique": "Exfiltration Over C2 Channel",
    },
]

RISK_DELTA = {"info": 0.5, "low": 1.0, "medium": 3.0, "high": 6.0, "critical": 10.0}

#: Events per second. ``0`` stops the feed.
rate: float = 0.0
_task: Optional[asyncio.Task[None]] = None


def _targets() -> list[dict[str, Any]]:
    """Addressable inventory assets, read fresh so a re-seed is picked up."""
    with SessionLocal() as session:
        assets = session.scalars(select(Asset).where(Asset.ip.is_not(None))).all()
    return [{"id": a.id, "ip": a.ip, "host": a.name} for a in assets]


def _make_event(targets: list[dict[str, Any]]) -> dict[str, Any]:
    attack = random.choice(ATTACKS)
    target = random.choice(targets)
    return {
        "id": f"demo-{random.getrandbits(64):016x}",
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
        "risk_delta": RISK_DELTA[attack["severity"]],
        "raw_source": "demo-feed",
        "meta": {},
    }


async def _loop(interval: float, targets: list[dict[str, Any]]) -> None:
    while True:
        event = _make_event(targets)
        with SessionLocal() as session:
            result = await asyncio.to_thread(repository.ingest_events, session, [event])
        if result.stored:
            await manager.broadcast_events([event])
            await manager.maybe_broadcast_risks(result.risks)
            await manager.maybe_broadcast_state(await asyncio.to_thread(current_state))
        await asyncio.sleep(interval)


async def set_rate(new_rate: float) -> dict[str, Any]:
    """Start, re-time or stop the feed. Returns the current status."""
    global rate, _task

    rate = max(0.0, min(50.0, new_rate))
    if _task is not None and not _task.done():
        _task.cancel()
        _task = None
    if rate > 0:
        _task = asyncio.create_task(_loop(1.0 / rate, _targets()))
    return status()


def status() -> dict[str, Any]:
    running = _task is not None and not _task.done()
    return {"enabled": True, "rate": rate if running else 0.0, "running": running}
