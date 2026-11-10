from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import assets, events, health, ingest, state

app = FastAPI(title="ThreatScope 3D API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(assets.router, prefix="/api")
app.include_router(events.router, prefix="/api")
app.include_router(ingest.router, prefix="/api")
app.include_router(state.router, prefix="/api")
