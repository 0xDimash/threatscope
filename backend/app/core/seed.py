"""Seed the shared asset inventory into the database.

``make seed`` runs this. The inventory lives at ``data/assets.json`` (owned by Design) and is
validated against ``app.schemas.contract`` before a single row is written, so a typo in the
file fails loudly instead of producing a half-populated city.

Seeding is replace-based: the file is the source of truth for assets and links, so rows are
deleted and re-inserted. ``risk_snapshots`` cascade away with their asset — re-seeding resets
risk, which is the intended behaviour for a demo reset.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Optional

from pydantic import ValidationError
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.core.config import REPO_ROOT, settings
from app.core.db import SessionLocal, init_db
from app.models import Asset, Link
from app.schemas.contract import Asset as AssetSchema
from app.schemas.contract import Link as LinkSchema


class SeedError(RuntimeError):
    """Raised when the inventory file is missing, malformed, or fails contract validation."""


def resolve_inventory_path(path: Optional[str] = None) -> Path:
    """Return the inventory file to load.

    Without an explicit path the shared ``data/assets.json`` wins; the contract fixture is
    used as a fallback so ``make seed`` still works before Design's PR lands.
    """
    if path is not None:
        candidates = [Path(path)]
    else:
        candidates = [
            REPO_ROOT / settings.assets_file,
            REPO_ROOT / settings.assets_fallback_file,
        ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    searched = ", ".join(str(item) for item in candidates)
    raise SeedError(f"asset inventory not found; looked at: {searched}")


def load_inventory(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
    except OSError as exc:
        raise SeedError(f"cannot read {path}: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise SeedError(f"{path} is not valid JSON: {exc}") from exc
    if not isinstance(payload, dict) or not isinstance(payload.get("assets"), list):
        raise SeedError(f'{path} must be a JSON object with an "assets" list')
    return payload


def validate_inventory(
    inventory: dict[str, Any],
) -> tuple[list[AssetSchema], list[LinkSchema]]:
    """Validate every asset and link against the contract schema."""
    assets: list[AssetSchema] = []
    for index, item in enumerate(inventory["assets"]):
        try:
            assets.append(AssetSchema.model_validate(item))
        except ValidationError as exc:
            raise SeedError(f"asset #{index} is invalid:\n{exc}") from exc

    links: list[LinkSchema] = []
    for index, item in enumerate(inventory.get("links") or []):
        try:
            links.append(LinkSchema.model_validate(item))
        except ValidationError as exc:
            raise SeedError(f"link #{index} is invalid:\n{exc}") from exc
    return assets, links


def seed_inventory(session: Session, inventory: dict[str, Any]) -> tuple[int, int, int]:
    """Replace assets and links with the inventory contents.

    Returns ``(assets_written, links_written, links_skipped)``. Links pointing at an asset
    that is not in the same file are skipped and counted — the contract forbids dangling
    edges, but one bad row must not drop the whole inventory.
    """
    assets, links = validate_inventory(inventory)
    known = {asset.id for asset in assets}

    session.execute(delete(Link))
    session.execute(delete(Asset))
    session.flush()

    session.add_all(
        [
            Asset(
                id=asset.id,
                name=asset.name,
                kind=asset.kind,
                criticality=asset.criticality,
                district=asset.district,
                position=asset.position.model_dump(),
                ip=asset.ip,
                tags=list(asset.tags),
            )
            for asset in assets
        ]
    )
    session.flush()

    rows: list[Link] = []
    skipped = 0
    for link in links:
        if link.source not in known or link.target not in known:
            skipped += 1
            continue
        rows.append(Link(source=link.source, target=link.target, kind=link.kind))
    session.add_all(rows)
    session.commit()
    return len(assets), len(rows), skipped


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", help="inventory JSON (default: data/assets.json)")
    args = parser.parse_args(argv)

    try:
        path = resolve_inventory_path(args.file)
        inventory = load_inventory(path)
        init_db()
        with SessionLocal() as session:
            assets, links, skipped = seed_inventory(session, inventory)
    except SeedError as exc:
        print(f"seed failed: {exc}", file=sys.stderr)
        return 1

    print(f"seeded {assets} assets and {links} links from {path}")
    if skipped:
        print(f"skipped {skipped} links with unknown endpoints", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
