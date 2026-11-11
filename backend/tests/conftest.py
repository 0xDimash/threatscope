"""Shared pytest fixtures.

The suite runs against a throwaway SQLite file. ``DATABASE_URL`` is set here, at import time,
which is before pytest imports any test module — so ``settings``, the engine and Alembic all
agree on the same temporary database and the developer's ``backend/data/*.db`` is never touched.

Each fixture starts from a clean schema *built by the migrations*, not by ``create_all``: the
test suite is the first place a broken migration would show up, so it must fail here.
"""

from __future__ import annotations

import os
import tempfile
from collections.abc import Iterator
from pathlib import Path
from typing import TYPE_CHECKING

import pytest

if TYPE_CHECKING:
    from fastapi.testclient import TestClient
    from sqlalchemy.orm import Session

_TMP_DIR = Path(tempfile.mkdtemp(prefix="threatscope-tests-"))
os.environ["DATABASE_URL"] = f"sqlite+pysqlite:///{(_TMP_DIR / 'test.db').as_posix()}"

#: Deterministic inventory for API tests. The shared ``data/assets.json`` is owned by Design
#: and may grow; the frozen contract fixture keeps these assertions stable.
SAMPLE_ASSETS: Path = Path(__file__).resolve().parents[2] / "contract" / "assets.sample.json"


def _reset_database() -> None:
    """Drop everything, forget Alembic's version, and migrate back to ``head``."""
    from sqlalchemy import text

    import app.models  # noqa: F401  -- registers every table on Base.metadata
    from app.core.db import Base, engine, init_db
    Base.metadata.drop_all(bind=engine)
    with engine.begin() as connection:
        connection.execute(text("DROP TABLE IF EXISTS alembic_version"))
    init_db()
    # Alembic migrates through its own engine. Drop this pool so pooled connections do not
    # keep a pre-migration SQLite schema cache (which reflects as "no indexes").
    engine.dispose()


@pytest.fixture()
def session() -> Iterator[Session]:
    """A session on a freshly migrated schema."""
    from app.core.db import SessionLocal

    _reset_database()
    with SessionLocal() as db_session:
        yield db_session


@pytest.fixture()
def seeded_assets(session: Session) -> Iterator[None]:
    """Database populated with the contract's sample inventory.

    Depends on ``session`` so a test can ask for both and see the same committed rows.
    """
    from app.core.seed import load_inventory, seed_inventory

    seed_inventory(session, load_inventory(SAMPLE_ASSETS))
    yield


@pytest.fixture()
def client(seeded_assets: None) -> Iterator[TestClient]:
    """A FastAPI test client with a migrated, seeded database.

    Entering the context runs the app's lifespan (``init_db``), which is a no-op at ``head``.
    """
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client
