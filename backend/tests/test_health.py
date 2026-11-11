from __future__ import annotations

from fastapi.testclient import TestClient


def test_healthz(client: TestClient) -> None:
    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_assets_shape(client: TestClient) -> None:
    body = client.get("/api/assets").json()

    assert "assets" in body and "links" in body
    assert body["assets"]
