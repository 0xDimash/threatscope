"""``/api/demo/feed`` — dev-only control for the synthetic threat feed.

Mounted from ``app.main`` only when ``DEMO_FEED=1``, so a real deployment cannot fabricate
attacks through the API.
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services import demo_feed

router = APIRouter()


class FeedRequest(BaseModel):
    rate: float = Field(ge=0, le=50, description="events per second; 0 stops the feed")


class FeedStatus(BaseModel):
    enabled: bool
    rate: float
    running: bool


@router.get("/demo/feed", response_model=FeedStatus)
def get_feed() -> FeedStatus:
    """Current demo feed rate."""
    return FeedStatus(**demo_feed.status())


@router.post("/demo/feed", response_model=FeedStatus)
async def set_feed(request: FeedRequest) -> FeedStatus:
    """Start, re-time or stop the demo feed."""
    return FeedStatus(**await demo_feed.set_rate(request.rate))
