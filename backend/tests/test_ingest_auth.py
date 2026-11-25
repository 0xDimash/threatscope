"""Ingest authentication and startup guard behavior."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import _require_ingest_auth_config, app


def test_ingest_rejects_missing_token(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ingest_token", "secret-token")
    monkeypatch.setattr(settings, "allow_unauthenticated_ingest", False)
    monkeypatch.setattr(settings, "demo_feed", False)

    response = client.post("/api/ingest/batch", json={"events": []})

    assert response.status_code == 401
    assert "Authorization" in response.json()["detail"]


def test_ingest_rejects_wrong_token(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ingest_token", "secret-token")
    monkeypatch.setattr(settings, "allow_unauthenticated_ingest", False)
    monkeypatch.setattr(settings, "demo_feed", False)

    response = client.post(
        "/api/ingest/batch",
        json={"events": []},
        headers={"Authorization": "Bearer wrong-token"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid ingest token."


def test_ingest_accepts_correct_token(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ingest_token", "secret-token")
    monkeypatch.setattr(settings, "allow_unauthenticated_ingest", False)
    monkeypatch.setattr(settings, "demo_feed", False)

    response = client.post(
        "/api/ingest/batch",
        json={"events": []},
        headers={"Authorization": "Bearer secret-token"},
    )

    assert response.status_code == 200
    assert response.json() == {"accepted": 0, "stored": 0}


def test_raw_ingest_requires_token(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ingest_token", "secret-token")
    monkeypatch.setattr(settings, "allow_unauthenticated_ingest", False)
    monkeypatch.setattr(settings, "demo_feed", False)

    response = client.post("/api/ingest", json={"source": "zeek", "raw": ""})

    assert response.status_code == 401


def test_startup_refuses_missing_ingest_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ingest_token", "")
    monkeypatch.setattr(settings, "allow_unauthenticated_ingest", False)
    monkeypatch.setattr(settings, "demo_feed", False)

    with pytest.raises(RuntimeError, match="INGEST_TOKEN is required"):
        _require_ingest_auth_config()


def test_startup_allows_demo_feed_without_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ingest_token", "")
    monkeypatch.setattr(settings, "allow_unauthenticated_ingest", False)
    monkeypatch.setattr(settings, "demo_feed", True)

    with patch("app.main.logger.warning") as warning:
        _require_ingest_auth_config()

    warning.assert_called_once()
    assert "INGEST_TOKEN is unset" in warning.call_args[0][0]


def test_startup_allows_explicit_unauthenticated_ingest(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "ingest_token", "")
    monkeypatch.setattr(settings, "allow_unauthenticated_ingest", True)
    monkeypatch.setattr(settings, "demo_feed", False)

    with patch("app.main.logger.warning") as warning:
        _require_ingest_auth_config()

    warning.assert_called_once()
    assert "ALLOW_UNAUTHENTICATED_INGEST" in str(warning.call_args)


def test_startup_allows_configured_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ingest_token", "secret-token")
    monkeypatch.setattr(settings, "allow_unauthenticated_ingest", False)
    monkeypatch.setattr(settings, "demo_feed", False)

    _require_ingest_auth_config()


def test_lifespan_rejects_missing_ingest_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ingest_token", "")
    monkeypatch.setattr(settings, "allow_unauthenticated_ingest", False)
    monkeypatch.setattr(settings, "demo_feed", False)

    with pytest.raises(RuntimeError, match="INGEST_TOKEN is required"), TestClient(app):
        pass
