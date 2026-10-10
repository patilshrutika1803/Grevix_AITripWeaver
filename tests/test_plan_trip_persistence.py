from __future__ import annotations

import json

from fastapi.testclient import TestClient

import main
from database.mongodb import get_database
from models.schemas import TravelPlan, UserPreferences


class FakeGraph:
    def invoke(self, payload, config):
        return {"intent": "plan_trip"}

    def stream(self, payload, config, stream_mode=None):
        return iter(())

    def get_state(self, config):
        return type("State", (), {"values": {"intent": "plan_trip"}})()


class FakeGraphBuilder:
    def build_graph(self):
        return FakeGraph()


class FakeTripService:
    def __init__(self, database):
        self.database = database

    def travelplan_to_trip(self, plan, user_id=None):
        return {"id": "persisted-trip-id", "user_id": user_id}

    def create_trip(self, trip):
        return trip


def _plan() -> TravelPlan:
    return TravelPlan(
        preferences=UserPreferences(
            destination="Kyoto",
            duration=2,
            total_budget=500,
            budget_currency="INR",
            travel_style="balanced",
        ),
        itinerary=[],
        revision_history=[],
        data_freshness={},
    )


def _client(monkeypatch, *, persistence_fails=False):
    monkeypatch.setattr(main, "GraphBuilder", FakeGraphBuilder)
    monkeypatch.setattr(main, "validate_final_state", lambda state: [])
    monkeypatch.setattr(main, "build_final_plan", lambda state: _plan())
    monkeypatch.setattr(main, "TripService", FakeTripService)
    main.app.dependency_overrides[get_database] = lambda: object()
    client = TestClient(main.app)

    if persistence_fails:
        class FailingTripService(FakeTripService):
            def create_trip(self, trip):
                raise RuntimeError("database unavailable")

        monkeypatch.setattr(main, "TripService", FailingTripService)
    return client


def test_sync_plan_returns_persisted_mongodb_trip_id(monkeypatch):
    client = _client(monkeypatch)
    try:
        response = client.post("/plan", json={"question": "Plan Kyoto", "remember_me": False})
    finally:
        main.app.dependency_overrides.pop(get_database, None)

    assert response.status_code == 200
    assert response.json()["trip_id"] == "persisted-trip-id"


def test_streaming_plan_returns_same_persisted_mongodb_trip_id(monkeypatch):
    client = _client(monkeypatch)
    try:
        response = client.post("/plan/stream", json={"question": "Plan Kyoto", "remember_me": False})
    finally:
        main.app.dependency_overrides.pop(get_database, None)

    assert response.status_code == 200
    done_events = [
        json.loads(line.removeprefix("data: "))
        for line in response.text.splitlines()
        if line.startswith("data: ") and '"status": "done"' in line
    ]
    assert len(done_events) == 1
    assert done_events[0]["data"]["trip_id"] == "persisted-trip-id"


def test_sync_plan_surfaces_persistence_failure(monkeypatch):
    client = _client(monkeypatch, persistence_fails=True)
    try:
        response = client.post("/plan", json={"question": "Plan Kyoto", "remember_me": False})
    finally:
        main.app.dependency_overrides.pop(get_database, None)

    assert response.status_code == 500
    assert response.json()["error"] == main.GENERIC_ERROR_MESSAGE


def test_streaming_plan_surfaces_persistence_failure(monkeypatch):
    client = _client(monkeypatch, persistence_fails=True)
    try:
        response = client.post("/plan/stream", json={"question": "Plan Kyoto", "remember_me": False})
    finally:
        main.app.dependency_overrides.pop(get_database, None)

    assert response.status_code == 200
    assert '"status": "error"' in response.text
    assert main.GENERIC_ERROR_MESSAGE in response.text
