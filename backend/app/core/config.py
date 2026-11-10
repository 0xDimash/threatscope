from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://threatscope:threatscope@localhost:5432/threatscope"
    cors_origins: str = "http://localhost:5173"
    log_level: str = "info"


settings = Settings()
