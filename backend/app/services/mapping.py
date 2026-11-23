"""Resolve event endpoints to inventory assets.

Adapters are pure and never see the database; this module is the one place where an IP or a
host name becomes an ``asset_id``. It is called from ``repository.add_events`` before insert,
so every source benefits and an old capture can be re-mapped without touching the parsers.

Rules:

- **IP first, host second.** An address is authoritative; a host name is a weaker hint.
  Exact address match wins over CIDR membership, which wins over the host-name match.
- **Never overwrite.** An ``asset_id`` already set by the adapter or the simulator is kept —
  the producer knows more than a lookup table does.
- **Unknown stays ``null``.** A guessed asset would draw an attack arc onto the wrong
  building, which is worse than no arc; the contract says unmapped is ``null``.
- The caller's dicts are copied, not mutated.
"""

from __future__ import annotations

import contextlib
import ipaddress
from collections.abc import Iterable
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Asset

_ASSET_ID_PREFIX = "asset-"


class AssetLookup:
    """Immutable index over the inventory, built once per ingest batch."""

    def __init__(self, assets: Iterable[Asset]) -> None:
        self._by_ip: dict[str, str] = {}
        self._by_network: list[tuple[ipaddress.IPv4Network | ipaddress.IPv6Network, str]] = []
        self._by_host: dict[str, str] = {}

        for asset in sorted(assets, key=lambda item: item.id):
            address = (asset.ip or "").strip()
            if address:
                if "/" in address:
                    with contextlib.suppress(ValueError):
                        network = ipaddress.ip_network(address, strict=False)
                        self._by_network.append((network, asset.id))
                else:
                    self._by_ip.setdefault(address, asset.id)
            for key in _host_keys(asset):
                self._by_host.setdefault(key, asset.id)

    def by_ip(self, value: Optional[str]) -> Optional[str]:
        address = (value or "").strip()
        if not address:
            return None
        if address in self._by_ip:
            return self._by_ip[address]
        try:
            parsed = ipaddress.ip_address(address)
        except ValueError:
            return None
        for network, asset_id in self._by_network:
            if parsed.version == network.version and parsed in network:
                return asset_id
        return None

    def by_host(self, value: Optional[str]) -> Optional[str]:
        key = (value or "").strip().lower().rstrip(".")
        return self._by_host.get(key) if key else None

    def resolve(self, *, ip: Optional[str] = None, host: Optional[str] = None) -> Optional[str]:
        """Return the asset for an endpoint, preferring the address over the name."""
        return self.by_ip(ip) or self.by_host(host)


def build_lookup(session: Session) -> AssetLookup:
    """Load the inventory once; callers reuse the result for a whole batch."""
    return AssetLookup(session.scalars(select(Asset)).all())


def apply_mapping(session: Session, events: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return copies of ``events`` with ``src``/``dst`` ``asset_id`` filled where known."""
    lookup = build_lookup(session)
    mapped: list[dict[str, Any]] = []
    for event in events:
        copy = dict(event)
        for side in ("src", "dst"):
            endpoint = dict(copy.get(side) or {})
            if not endpoint.get("asset_id"):
                resolved = lookup.resolve(ip=endpoint.get("ip"), host=endpoint.get("host"))
                if resolved:
                    endpoint["asset_id"] = resolved
            copy[side] = endpoint
        mapped.append(copy)
    return mapped


def _host_keys(asset: Asset) -> list[str]:
    """Lower-case aliases an event may use for this asset.

    The inventory names a node ``asset-egov-portal``, while logs say ``egov-portal`` or
    ``Egov Portal``. Accepting the id, the id without its prefix, the display name and the
    display name slugified keeps the mapping honest without a fuzzy match.
    """
    keys: set[str] = set()
    candidates = [asset.id, asset.name]
    if asset.id.startswith(_ASSET_ID_PREFIX):
        candidates.append(asset.id[len(_ASSET_ID_PREFIX) :])
    for value in candidates:
        text = (value or "").strip().lower().rstrip(".")
        if not text:
            continue
        keys.add(text)
        keys.add("-".join(text.split()))
        keys.add("_".join(text.split()))
    return sorted(keys)
