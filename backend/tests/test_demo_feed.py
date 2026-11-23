"""The demo feed generates contract-shaped events and toggles on demand."""

from __future__ import annotations

import asyncio

from app.services import demo_feed

TARGETS = [{"id": "asset-egov-portal", "ip": "10.10.4.21", "host": "egov-portal"}]


def test_make_event_matches_the_contract() -> None:
    event = demo_feed._make_event(TARGETS)

    assert event["id"].startswith("demo-")
    assert event["dst"]["asset_id"] == "asset-egov-portal"
    assert event["src"]["asset_id"] is None  # attackers are external
    assert event["severity"] in {"low", "medium", "high", "critical"}
    assert event["risk_delta"] > 0
    assert event["mitre"]["tactic"]
    assert event["ts"].endswith("Z")


def test_set_rate_clamps_and_reports(monkeypatch) -> None:
    monkeypatch.setattr(demo_feed, "_targets", lambda: TARGETS)

    async def scenario() -> None:
        assert (await demo_feed.set_rate(0)).get("running") is False
        started = await demo_feed.set_rate(5)
        assert started["running"] is True
        assert started["rate"] == 5
        assert (await demo_feed.set_rate(500))["rate"] == 50  # clamped
        stopped = await demo_feed.set_rate(0)
        assert stopped["running"] is False
        assert stopped["rate"] == 0.0

    asyncio.run(scenario())
