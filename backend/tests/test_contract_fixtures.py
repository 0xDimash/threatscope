"""Contract fixtures must match every producer and consumer (issue #6).

These tests live in the normal backend suite, so they run on every PR. They fail when the
shared fixtures in ``contract/`` drift from the Pydantic mirror in ``app.schemas.contract`` or
from what the Zeek adapter emits — the three-way agreement the API contract depends on.

They deliberately read the committed fixtures, not generated data: the fixture *is* the
contract example that frontend and backend both compile against.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.core.config import REPO_ROOT
from app.ingest.base import CONTRACT_KEYS
from app.ingest.zeek import parse_notice_log
from app.schemas.contract import Asset, Link, SecurityEvent

ASSETS_FIXTURE: Path = REPO_ROOT / "contract" / "assets.sample.json"
EVENTS_FIXTURE: Path = REPO_ROOT / "contract" / "events.sample.json"
ZEEK_FIXTURE: Path = Path(__file__).parent / "fixtures" / "zeek" / "notice.log"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def test_assets_fixture_matches_asset_and_link_shape() -> None:
    payload = load_json(ASSETS_FIXTURE)

    assert payload["assets"]
    for item in payload["assets"]:
        Asset.model_validate(item)
        assert set(item) == set(Asset.model_fields)

    for item in payload["links"]:
        Link.model_validate(item)
        assert set(item) == set(Link.model_fields)


def test_every_link_points_at_a_known_asset() -> None:
    payload = load_json(ASSETS_FIXTURE)
    known = {asset["id"] for asset in payload["assets"]}

    for link in payload["links"]:
        assert link["source"] in known
        assert link["target"] in known
        assert link["source"] != link["target"]


def test_events_fixture_matches_security_event_shape() -> None:
    events = load_json(EVENTS_FIXTURE)

    assert events
    for item in events:
        SecurityEvent.model_validate(item)
        assert set(item) == set(SecurityEvent.model_fields)


def test_zeek_output_keys_match_the_events_fixture() -> None:
    fixture_events = load_json(EVENTS_FIXTURE)
    parsed = parse_notice_log(ZEEK_FIXTURE.read_text(encoding="utf-8"))

    assert parsed
    fixture_keys = set(fixture_events[0])
    for event in parsed:
        assert set(event) == fixture_keys
        assert fixture_keys == set(CONTRACT_KEYS)


def test_pydantic_contract_fields_match_the_events_fixture() -> None:
    fixture_events = load_json(EVENTS_FIXTURE)

    assert set(SecurityEvent.model_fields) == set(fixture_events[0]) == set(CONTRACT_KEYS)
