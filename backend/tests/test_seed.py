"""Seeding: the inventory file is the source of truth for assets and links."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from app.core.config import REPO_ROOT
from app.core.seed import (
    SeedError,
    load_inventory,
    resolve_inventory_path,
    seed_inventory,
)
from app.models import Asset, Link

SAMPLE: Path = REPO_ROOT / "contract" / "assets.sample.json"


def test_resolves_an_existing_inventory() -> None:
    path = resolve_inventory_path()

    assert path.is_file()
    assert load_inventory(path)["assets"]


def test_missing_explicit_path_is_an_error(tmp_path: Path) -> None:
    with pytest.raises(SeedError):
        resolve_inventory_path(str(tmp_path / "nope.json"))


def test_seeds_every_asset_and_link(session) -> None:
    inventory = load_inventory(SAMPLE)

    assets, links, skipped = seed_inventory(session, inventory)

    assert assets == len(inventory["assets"])
    assert links == len(inventory["links"])
    assert skipped == 0
    assert session.query(Asset).count() == assets
    assert session.query(Link).count() == links


def test_reseeding_replaces_instead_of_duplicating(session) -> None:
    inventory = load_inventory(SAMPLE)

    seed_inventory(session, inventory)
    seed_inventory(session, inventory)

    assert session.query(Asset).count() == len(inventory["assets"])
    assert session.query(Link).count() == len(inventory["links"])


def test_links_with_unknown_endpoints_are_skipped(session) -> None:
    inventory: dict[str, Any] = {
        "assets": [
            {
                "id": "asset-a",
                "name": "A",
                "kind": "server",
                "criticality": 3,
                "position": {"x": 0, "y": 0, "z": 0},
                "tags": [],
            }
        ],
        "links": [
            {"source": "asset-a", "target": "asset-missing", "kind": "network"},
            {"source": "asset-a", "target": "asset-a", "kind": "dependency"},
        ],
    }

    assets, links, skipped = seed_inventory(session, inventory)

    assert (assets, links, skipped) == (1, 1, 1)


def test_invalid_asset_fails_before_writing(session) -> None:
    inventory: dict[str, Any] = {
        "assets": [{"id": "asset-bad", "name": "Bad", "kind": "not-a-kind", "criticality": 9}],
        "links": [],
    }

    with pytest.raises(SeedError):
        seed_inventory(session, inventory)

    assert session.query(Asset).count() == 0


def test_inventory_without_assets_list_is_rejected(tmp_path: Path) -> None:
    path = tmp_path / "inventory.json"
    path.write_text(json.dumps({"links": []}), encoding="utf-8")

    with pytest.raises(SeedError):
        load_inventory(path)
