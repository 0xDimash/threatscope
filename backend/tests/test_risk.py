"""Pure risk model arithmetic: formula, weights, decay, thresholds and summaries."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any

import pytest

from app.services import risk

NOW = datetime(2026, 11, 23, 12, 0, tzinfo=timezone.utc)


def event(
    *,
    ts: datetime = NOW,
    risk_delta: float = 10.0,
    event_type: str = "port_scan",
) -> Any:
    return SimpleNamespace(ts=ts, type=event_type, risk_delta=risk_delta)


def test_score_matches_the_documented_formula() -> None:
    # 10 × (0.5 + 5/5) × decay(0) = 15.0 for a criticality-5 asset.
    assert risk.score([event(risk_delta=10.0)], 5, now=NOW) == pytest.approx((15.0, "ok"))


def test_score_is_monotonic_in_risk_delta() -> None:
    scores = [
        risk.score([event(risk_delta=delta)], 3, now=NOW)[0]
        for delta in (1.0, 4.0, 10.0, 25.0)
    ]

    assert scores == sorted(scores)
    assert len(set(scores)) == len(scores)


def test_criticality_weight_scales_the_score() -> None:
    low = risk.score([event(risk_delta=10.0)], 1, now=NOW)[0]
    high = risk.score([event(risk_delta=10.0)], 5, now=NOW)[0]

    assert low == pytest.approx(7.0)  # 10 × 0.7
    assert high == pytest.approx(15.0)  # 10 × 1.5
    assert high / low == pytest.approx(1.5 / 0.7)


def test_weight_matches_the_documented_table() -> None:
    assert risk.criticality_weight(1) == pytest.approx(0.7)
    assert risk.criticality_weight(3) == pytest.approx(1.1)
    assert risk.criticality_weight(5) == pytest.approx(1.5)


def test_score_decays_with_age() -> None:
    scores = [
        risk.score([event(ts=NOW - timedelta(hours=hours), risk_delta=10.0)], 5, now=NOW)[0]
        for hours in (0, 6, 12, 18)
    ]

    assert scores[0] == pytest.approx(15.0)
    assert scores[1] == pytest.approx(7.5)
    assert scores[2] == pytest.approx(3.75)
    assert scores[3] == pytest.approx(1.88)  # 1.875 rounded to the snapshot's 2 decimals


def test_events_older_than_the_window_are_ignored() -> None:
    just_inside = event(ts=NOW - timedelta(hours=23.9), risk_delta=10.0)
    outside = event(ts=NOW - timedelta(hours=24.1), risk_delta=10.0)

    summary = risk.assess([just_inside, outside], 5, now=NOW)

    assert summary.events_24h == 1
    assert summary.risk > 0


def test_future_events_are_treated_as_age_zero() -> None:
    future = event(ts=NOW + timedelta(hours=2), risk_delta=10.0)

    assert risk.score([future], 5, now=NOW)[0] == pytest.approx(15.0)


def test_score_is_clamped_at_one_hundred() -> None:
    events = [event(risk_delta=25.0) for _ in range(10)]

    assert risk.score(events, 5, now=NOW) == (100.0, "compromised")


@pytest.mark.parametrize(
    ("score", "expected"),
    [
        (0.0, "ok"),
        (19.99, "ok"),
        (20.0, "elevated"),
        (49.99, "elevated"),
        (50.0, "critical"),
        (79.99, "critical"),
        (80.0, "compromised"),
        (100.0, "compromised"),
    ],
)
def test_thresholds_map_to_contract_states(score: float, expected: str) -> None:
    assert risk.state_for(score) == expected


def test_top_types_are_the_three_most_frequent_and_deterministic() -> None:
    events = [
        event(event_type="a"),
        event(event_type="b"),
        event(event_type="b"),
        event(event_type="c"),
        event(event_type="c"),
        event(event_type="d"),
    ]

    summary = risk.assess(events, 1, now=NOW)

    assert summary.events_24h == 6
    assert summary.top_types == ["b", "c", "a"]


def test_info_events_are_counted_but_do_not_add_risk() -> None:
    summary = risk.assess([event(risk_delta=0.0, event_type="other")], 5, now=NOW)

    assert summary.risk == 0.0
    assert summary.state == "ok"
    assert summary.events_24h == 1
    assert summary.top_types == ["other"]
