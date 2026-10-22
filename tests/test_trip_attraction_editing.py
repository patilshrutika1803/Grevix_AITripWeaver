from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.v1.dependencies import CurrentUser, get_current_user
from api.v1.trips import get_database, router


class MemoryCollection:
    def __init__(self, record: dict[str, Any] | None = None):
        self.record = deepcopy(record)

    @staticmethod
    def _read_path(record: dict[str, Any], path: str) -> Any:
        value: Any = record
        for part in path.split("."):
            value = value[int(part)] if isinstance(value, list) else value.get(part)
        return value

    @staticmethod
    def _set_path(record: dict[str, Any], path: str, value: Any) -> None:
        parts = path.split(".")
        target: Any = record
        for part in parts[:-1]:
            target = target[int(part)] if isinstance(target, list) else target[part]
        if isinstance(target, list):
            target[int(parts[-1])] = value
        else:
            target[parts[-1]] = value

    def _matches(self, query: dict[str, Any]) -> bool:
        if "$or" in query:
            return any(self._matches(clause) for clause in query["$or"])
        if self.record is None:
            return False
        return all(self._read_path(self.record, path) == value for path, value in query.items())

    def find_one(self, query: dict[str, Any], *_args: Any, **_kwargs: Any) -> dict[str, Any] | None:
        return deepcopy(self.record) if self._matches(query) else None

    def update_one(self, query: dict[str, Any], update: dict[str, Any]) -> SimpleNamespace:
        if not self._matches(query):
            return SimpleNamespace(matched_count=0)
        for path, value in update.get("$set", {}).items():
            self._set_path(self.record, path, value)
        return SimpleNamespace(matched_count=1)


class MemoryDatabase:
    def __init__(self, trip: dict[str, Any]):
        self.trips = MemoryCollection(trip)
        self.users = MemoryCollection()

    def __getitem__(self, collection_name: str) -> MemoryCollection:
        return getattr(self, collection_name)


def make_trip(*, group: bool = False) -> dict[str, Any]:
    now = datetime.now(UTC)
    return {
        "_id": "trip-1",
        "id": "trip-1",
        "user_id": "owner",
        "is_group": group,
        "members": [
            {"user_id": "owner", "role": "owner", "status": "active"},
            {"user_id": "admin", "role": "admin", "status": "active"},
            {"user_id": "member", "role": "member", "status": "active"},
        ] if group else [],
        "title": "Kyoto trip",
        "destination": "Kyoto",
        "duration": 2,
        "total_budget": 1000,
        "budget_currency": "INR",
        "group_size": 2,
        "travel_style": "balanced",
        "itinerary": [
            {
                "day_number": 1,
                "theme": "Culture",
                "attractions": [
                    {
                        "place": {
                            "name": "Old museum",
                            "description": "Original description",
                            "category": "museum",
                            "entry_fee": "₹100",
                        },
                        "timing": "Morning",
                    },
                    {
                        "place": {
                            "name": "Garden",
                            "description": "Keep this description",
                            "category": "garden",
                            "entry_fee": "Free",
                        },
                        "timing": "Afternoon",
                    },
                ],
            },
            {
                "day_number": 2,
                "theme": "Departure",
                "attractions": [
                    {
                        "place": {
                            "name": "Station",
                            "description": "Another day",
                            "category": "transport",
                            "entry_fee": "Free",
                        },
                        "timing": "Evening",
                    }
                ],
            },
        ],
        "created_at": now,
        "updated_at": now,
    }


def make_client(database: MemoryDatabase, user_id: str) -> TestClient:
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_database] = lambda: database
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        id=user_id,
        name=user_id,
        email=f"{user_id}@example.test",
    )
    return TestClient(app)


def test_activity_update_persists_without_changing_other_itinerary_items():
    database = MemoryDatabase(make_trip())
    original_second_activity = deepcopy(database.trips.record["itinerary"][0]["attractions"][1])
    original_second_day = deepcopy(database.trips.record["itinerary"][1])
    with make_client(database, "owner") as client:
        response = client.patch(
            "/api/v1/trips/trip-1/days/1/attractions/0",
            json={
                "title": "Kyoto National Museum",
                "description": "Updated museum details",
                "time": "10:30 AM - 12:30 PM",
                "cost": 125.5,
            },
        )

        assert response.status_code == 200
        assert response.json()["attraction"]["place"]["name"] == "Kyoto National Museum"
        assert response.json()["attraction"]["place"]["entry_fee"] == "125.5"

        fetched = client.get("/api/v1/trips/trip-1")

    assert fetched.status_code == 200
    saved_itinerary = fetched.json()["itinerary"]
    assert saved_itinerary[0]["attractions"][0] == response.json()["attraction"]
    assert saved_itinerary[0]["attractions"][1] == original_second_activity
    assert saved_itinerary[1] == original_second_day
    assert saved_itinerary[0]["theme"] == "Culture"


@pytest.mark.parametrize(
    "payload",
    [
        {"title": "", "description": "", "time": "Morning", "cost": 0},
        {"title": "Museum", "description": "", "time": " ", "cost": 0},
        {"title": "Museum", "description": "", "time": "Morning", "cost": -1},
        {"title": "Museum", "description": "", "time": "Morning", "cost": "invalid"},
        {"title": "Museum", "description": ""},
    ],
)
def test_activity_update_rejects_invalid_values(payload: dict[str, Any]):
    with make_client(MemoryDatabase(make_trip()), "owner") as client:
        response = client.patch("/api/v1/trips/trip-1/days/1/attractions/0", json=payload)

    assert response.status_code == 422


@pytest.mark.parametrize(
    ("group", "user_id"),
    [(False, "outsider"), (True, "member")],
)
def test_activity_update_preserves_trip_owner_and_group_edit_permissions(group: bool, user_id: str):
    database = MemoryDatabase(make_trip(group=group))
    original_attraction = deepcopy(database.trips.record["itinerary"][0]["attractions"][0])
    with make_client(database, user_id) as client:
        response = client.patch(
            "/api/v1/trips/trip-1/days/1/attractions/0",
            json={
                "title": "Unauthorized change",
                "description": "",
                "time": "Morning",
                "cost": 0,
            },
        )

    assert response.status_code == 404
    assert database.trips.record["itinerary"][0]["attractions"][0] == original_attraction


def test_group_admin_can_edit_an_attraction():
    database = MemoryDatabase(make_trip(group=True))
    with make_client(database, "admin") as client:
        response = client.patch(
            "/api/v1/trips/trip-1/days/1/attractions/0",
            json={
                "title": "Updated by admin",
                "description": "",
                "time": "Morning",
                "cost": 0,
            },
        )

    assert response.status_code == 200
    assert response.json()["attraction"]["place"]["name"] == "Updated by admin"
