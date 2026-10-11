from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.v1.dependencies as dependencies
from api.v1.trips import router as trips_router


def test_supabase_auth_client_uses_public_anon_key_for_user_verification(monkeypatch):
    created = {}

    class FakeAuth:
        def get_user(self, token):
            return token

    client = type("FakeClient", (), {"auth": FakeAuth()})()

    def create_client(url, key):
        created.update(url=url, key=key)
        return client

    monkeypatch.setenv("SUPABASE_URL", "https://supabase.example.test")
    monkeypatch.setenv("VITE_SUPABASE_ANON_KEY", "public-anon-test-key")
    monkeypatch.delenv("SUPABASE_ANON_KEY", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    monkeypatch.setattr(dependencies, "_supabase", None)
    monkeypatch.setattr(dependencies, "create_client", create_client)

    assert dependencies._get_supabase_client() is client
    assert created == {
        "url": "https://supabase.example.test",
        "key": "public-anon-test-key",
    }


def test_missing_bearer_token_is_rejected_before_database_access(monkeypatch):
    calls = 0

    def fail_if_called():
        nonlocal calls
        calls += 1
        raise AssertionError("database must not be accessed without credentials")

    monkeypatch.setattr(dependencies, "get_database", fail_if_called)
    app = FastAPI()
    app.include_router(trips_router)

    response = TestClient(app).get("/api/v1/trips")

    assert response.status_code == 401
    assert calls == 0


def test_database_initialization_failure_returns_sanitized_service_unavailable(monkeypatch):
    def fail_to_connect():
        raise RuntimeError("private MongoDB connection details")

    monkeypatch.setattr(dependencies, "get_database", fail_to_connect)
    app = FastAPI()
    app.include_router(trips_router)

    response = TestClient(app).get(
        "/api/v1/trips",
        headers={"Authorization": "Bearer test-token"},
    )

    assert response.status_code == 503
    assert "private" not in response.text
