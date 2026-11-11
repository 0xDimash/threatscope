"""Portable column types and ISO-8601 helpers shared by the ORM models.

SQLite is the default store (see ``docs/adr/0002-sqlite.md``) and must stay swappable for
Postgres through ``DATABASE_URL`` alone. Everything here uses types both dialects support.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import DateTime
from sqlalchemy.types import TypeDecorator


def parse_iso(value: str) -> datetime:
    """Parse an ISO-8601 timestamp (``Z`` or ``+00:00``) into an aware UTC datetime."""
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    moment = datetime.fromisoformat(text)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc)


def format_iso(value: datetime) -> str:
    """Format a datetime as the contract's ISO-8601 UTC string.

    Example: ``2026-11-10T09:14:22.481Z``.
    """
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class UtcDateTime(TypeDecorator[datetime]):
    """Timezone-aware UTC datetime that round-trips through SQLite and Postgres.

    SQLite has no native timestamp type and drops ``tzinfo`` on the way out, so results are
    always re-tagged as UTC. Strings are accepted on bind, which lets callers pass contract
    timestamps straight through.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: Any, dialect: Any) -> Optional[datetime]:
        if value is None:
            return None
        if isinstance(value, str):
            return parse_iso(value)
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    def process_result_value(self, value: Any, dialect: Any) -> Optional[datetime]:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
