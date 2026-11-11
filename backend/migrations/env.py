"""Alembic environment: migrations run against ``DATABASE_URL`` using the ORM metadata.

The URL is resolved in this order: an explicit ``sqlalchemy.url`` injected by the caller
(``app.core.db.init_db`` and the test suite), then ``app.core.config.settings``. That keeps
``uvicorn``, ``make seed`` and ``pytest`` on the same migration path.
"""

from __future__ import annotations

from logging.config import fileConfig
from typing import Any

from alembic import context
from sqlalchemy import engine_from_config, pool

import app.models  # noqa: F401  -- registers every table on Base.metadata
from app.core.config import settings
from app.core.db import Base
from app.core.types import UtcDateTime

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _database_url() -> str:
    return config.get_main_option("sqlalchemy.url") or settings.database_url


def render_item(type_: str, obj: Any, autogen_context: Any) -> Any:
    """Render ``UtcDateTime`` as plain ``sa.DateTime`` so migrations need no project imports."""
    if type_ == "type" and isinstance(obj, UtcDateTime):
        return "sa.DateTime(timezone=True)"
    return False


def run_migrations_offline() -> None:
    """Render SQL without a live connection (``alembic upgrade --sql``)."""
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
        render_item=render_item,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    section: dict[str, Any] = dict(config.get_section(config.config_ini_section) or {})
    section["sqlalchemy.url"] = _database_url()
    connectable = engine_from_config(section, prefix="sqlalchemy.", poolclass=pool.NullPool)
    try:
        with connectable.connect() as connection:
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                # SQLite cannot ALTER most things; batch mode rewrites the table instead.
                render_as_batch=True,
                render_item=render_item,
            )
            with context.begin_transaction():
                context.run_migrations()
    finally:
        connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
