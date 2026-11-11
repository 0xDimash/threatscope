"""Shared FastAPI dependencies.

``SessionDep`` is the ``Annotated`` form of ``Depends(get_session)``: it keeps the dependency
in the type rather than in a default value, which is both the current FastAPI style and what
ruff's bugbear rules expect.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.db import get_session

SessionDep = Annotated[Session, Depends(get_session)]

__all__ = ["SessionDep"]
