from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

#: ``backend/`` — the directory containing ``pyproject.toml`` and ``migrations/``.
BACKEND_DIR = Path(__file__).resolve().parents[2]
#: Repository root — where ``data/`` and ``contract/`` live.
REPO_ROOT = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite+pysqlite:///./data/threatscope.db"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    log_level: str = "info"
    #: Dev-only synthetic threat feed, controlled from ``POST /api/demo/feed``.
    demo_feed: bool = False
    #: Bearer token required by /api/ingest and /api/ingest/batch.
    ingest_token: str = ""
    #: Explicit escape hatch for local/demo runs without ingest auth.
    allow_unauthenticated_ingest: bool = False

    #: Shared asset inventory, relative to the repository root (owned by Design).
    assets_file: str = "data/assets.json"
    #: Contract fixture used until ``data/assets.json`` is merged.
    assets_fallback_file: str = "contract/assets.sample.json"

    @property
    def cors_origin_list(self) -> list[str]:
        """``CORS_ORIGINS`` as a list; comma-separated in the environment."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()

