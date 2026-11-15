"""The browser app runs on either loopback spelling; both must pass CORS.

Vite is usually opened at ``http://localhost:5173``, but ``http://127.0.0.1:5173`` is just as
common (and is what scripts and the in-app browser use). Allowing only one silently breaks the
live feed and the health indicator, so both origins are part of the default configuration.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.config import settings

LOCAL_ORIGINS = ("http://localhost:5173", "http://127.0.0.1:5173")


def test_default_cors_origins_cover_local_vite() -> None:
    for origin in LOCAL_ORIGINS:
        assert origin in settings.cors_origin_list


def test_preflight_from_loopback_origin_is_allowed(client: TestClient) -> None:
    for origin in LOCAL_ORIGINS:
        response = client.options(
            "/api/assets",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "GET",
            },
        )
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == origin
