"""HTTP API smoke tests."""
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes import router


@pytest.fixture
def client() -> TestClient:
    """Build a router-only app so we don't start the background poller."""
    app = FastAPI()
    app.include_router(router)
    return TestClient(app, raise_server_exceptions=True)


def test_health(client: TestClient) -> None:
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_config(client: TestClient) -> None:
    r = client.get("/config")
    assert r.status_code == 200
    body = r.json()
    assert "symbols" in body
    assert "data_provider" in body


def test_snapshot_404_when_empty(client: TestClient) -> None:
    r = client.get("/snapshot/UNKNOWN")
    assert r.status_code == 404
