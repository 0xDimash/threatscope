"""Shared pytest fixtures.

The suite runs against a throwaway SQLite file. ``DATABASE_URL`` is set here, at import time,
which is before pytest imports any test module — so ``settings``, the engine and Alembic all
agree on the same temporary database and the developer's ``backend/data/*.db`` is never touched.
"""

from __future__ import annotations

import os
import tempfile
from collections.abc import Iterator
from pathlib import Path
from typing import TYPE_CHECKING

import pytest

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

_TMP_DIR = Path(tempfile.mkdtemp(prefix="threatscope-tests-"))
os.environ["DATABASE_URL"] = f"sqlite+pysqlite:///{(_TMP_DIR / 'test.db').as_posix()}"


@pytest.fixture()
def session() -> Iterator[Session]:
    """A session on a freshly created schema."""
    from app.core.db import Base, SessionLocal, engine

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db_session:
        yield db_session
