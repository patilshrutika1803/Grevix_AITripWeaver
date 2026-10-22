from copy import deepcopy
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient

from api.v1 import dependencies
from api.v1.dependencies import CurrentUser


@pytest.fixture
def journal_app():
    class Cursor(list):
        def sort(self, keys):
            for key, direction in reversed(keys):
                super().sort(key=lambda document: document.get(key), reverse=direction < 0)
            return self

    class Collection:
        def __init__(self):
            self.documents = []

        @classmethod
        def _matches(cls, document, query):
            for key, expected in query.items():
                if key == "$or":
                    if not any(cls._matches(document, option) for option in expected):
                        return False
                    continue
                actual = document.get(key)
                if actual != expected and not (isinstance(actual, list) and expected in actual):
                    return False
            return True

        def find_one(self, query, projection=None):
            document = next(
                (item for item in self.documents if self._matches(item, query)),
                None,
            )
            if document is None:
                return None
            result = deepcopy(document)
            if projection:
                included = {key for key, enabled in projection.items() if enabled}
                if included:
                    result = {
                        key: value for key, value in result.items()
                        if key in included or key == "_id"
                    }
            return result

        def find(self, query):
            return Cursor([
                deepcopy(item) for item in self.documents
                if self._matches(item, query)
            ])

        def insert_one(self, document):
            self.documents.append(deepcopy(document))

        def update_one(self, query, update):
            document = next(
                (item for item in self.documents if self._matches(item, query)),
                None,
            )
            if document is None:
                return type("UpdateResult", (), {"matched_count": 0, "modified_count": 0})()
            changed = False
            for key, value in update.get("$set", {}).items():
                if document.get(key) != value:
                    document[key] = deepcopy(value)
                    changed = True
            return type("UpdateResult", (), {
                "matched_count": 1,
                "modified_count": int(changed),
            })()

        def delete_one(self, query):
            for index, document in enumerate(self.documents):
                if self._matches(document, query):
                    del self.documents[index]
                    return

    class Database:
        def __init__(self):
            self.trips = Collection()
            self.users = Collection()
            self.journal_entries = Collection()
            self.expenses = Collection()
            self.notifications = Collection()

    database = Database()
    tokens = {}
    import main

    original_overrides = dict(main.app.dependency_overrides)

    def authenticate(
        credentials: HTTPAuthorizationCredentials = Depends(dependencies._require_bearer),
    ) -> CurrentUser:
        user = tokens.get(credentials.credentials)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required.",
            )
        return user

    main.app.dependency_overrides[dependencies.get_authenticated_database] = lambda: database
    main.app.dependency_overrides[dependencies.get_current_user] = authenticate
    yield {"main": main, "database": database, "tokens": tokens}
    main.app.dependency_overrides.clear()
    main.app.dependency_overrides.update(original_overrides)


@pytest.fixture
def journal_clients(journal_app):
    def register(name, email):
        user = CurrentUser(id=email.split("@")[0], name=name, email=email)
        token = f"journal-test-token-{user.id}"
        journal_app["tokens"][token] = user
        journal_app["database"].users.insert_one({
            "_id": user.id,
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "is_active": user.is_active,
            "is_verified": user.is_verified,
            "is_admin": user.is_admin,
        })
        client = TestClient(journal_app["main"].app)
        client.headers.update({"Authorization": f"Bearer {token}"})
        return client, user.model_dump()

    return (
        register("Owner", "owner@example.com"),
        register("Member", "member@example.com"),
        register("Outsider", "outsider@example.com"),
    )


def _trip(client, title="Journal trip"):
    return client.post("/api/v1/trips", json={
        "title": title,
        "destination": "Kyoto",
        "duration": 5,
        "total_budget": 1200,
        "budget_currency": "JPY",
        "itinerary": [],
    }).json()


def test_personal_journal_crud_timeline_media_and_statistics(journal_clients, journal_app):
    (owner, owner_user), _, _ = journal_clients
    trip = _trip(owner)
    endpoint = f"/api/v1/trips/{trip['id']}/journal"
    unauthenticated = TestClient(journal_app["main"].app).get(endpoint)
    assert unauthenticated.status_code == 401

    later = owner.post(endpoint, json={
        "title": "Evening walk",
        "content": "Lanterns along the river.",
        "occurred_at": "2026-04-12T19:30:00Z",
        "media_references": ["https://example.com/river.jpg"],
    })
    assert later.status_code == 201, later.text
    assert later.json()["title"] == "Evening walk"
    assert later.json()["author_name"] == "Owner"
    assert later.json()["occurred_at"].startswith("2026-04-12T19:30:00")
    assert later.json()["created_at"]
    first = owner.post(endpoint, json={
        "title": "Arrival",
        "content": "Arrived in Kyoto.",
        "occurred_at": "2026-04-10T09:00:00Z",
        "media_references": [],
    })
    assert first.status_code == 201, first.text
    assert first.json()["created_by_user_id"] == owner_user["id"]
    assert first.json()["title"] == "Arrival"
    assert first.json()["media_references"] == []

    timeline = owner.get(endpoint)
    assert timeline.status_code == 200
    assert [entry["content"] for entry in timeline.json()] == ["Arrived in Kyoto.", "Lanterns along the river."]
    assert timeline.json()[0]["title"] == "Arrival"
    assert timeline.json()[0]["media_references"] == []
    assert timeline.json()[1]["title"] == "Evening walk"
    assert timeline.json()[1]["author_name"] == "Owner"
    assert timeline.json()[1]["media_references"] == ["https://example.com/river.jpg"]

    invalid_media = owner.post(endpoint, json={"content": "Bad reference", "media_references": ["javascript:alert(1)"]})
    assert invalid_media.status_code == 422
    invalid_update = owner.patch(f"/api/v1/journal-entries/{first.json()['id']}", json={"content": None})
    assert invalid_update.status_code == 422

    expense = owner.post(f"/api/v1/trips/{trip['id']}/expenses", json={
        "amount": "42.50",
        "category": "food",
        "participants": [{"user_id": owner_user["id"]}],
    })
    assert expense.status_code == 201, expense.text

    statistics = owner.get(f"{endpoint}/statistics")
    assert statistics.status_code == 200
    assert statistics.json() == {
        "trip_id": trip["id"],
        "planned_duration_days": 5,
        "journal_entry_count": 2,
        "journal_days_covered": 2,
        "media_reference_count": 1,
        "expense_total": "42.50",
        "expense_currency": "JPY",
    }

    update = owner.patch(f"/api/v1/journal-entries/{later.json()['id']}", json={
        "title": "Riverside evening",
        "content": "Updated note.",
        "media_references": [],
    })
    assert update.status_code == 200, update.text
    assert update.json()["title"] == "Riverside evening"
    assert update.json()["content"] == "Updated note."
    assert update.json()["media_references"] == []
    assert owner.delete(f"/api/v1/journal-entries/{first.json()['id']}").status_code == 204
    assert len(owner.get(endpoint).json()) == 1


def test_group_journal_access_author_mutations_and_removed_member(journal_clients, journal_app):
    (owner, _), (member, member_user), (outsider, _) = journal_clients
    trip = _trip(owner, "Shared journal")
    trip_id = trip["id"]
    group = owner.post(f"/api/v1/trips/{trip_id}/group")
    assert group.status_code == 200, group.text
    stored_trip = journal_app["database"].trips.find_one({"_id": trip_id})
    stored_trip["members"].append({
        "id": "member-record",
        "trip_id": trip_id,
        "user_id": member_user["id"],
        "role": "member",
        "status": "active",
        "joined_at": datetime.now(UTC),
    })
    journal_app["database"].trips.update_one(
        {"_id": trip_id},
        {"$set": {"members": stored_trip["members"]}},
    )

    endpoint = f"/api/v1/trips/{trip_id}/journal"
    entry = member.post(endpoint, json={"title": "Shared memory", "content": "A shared trip moment."})
    assert entry.status_code == 201, entry.text
    assert len(owner.get(endpoint).json()) == 1
    entry_id = entry.json()["id"]
    assert owner.patch(f"/api/v1/journal-entries/{entry_id}", json={"content": "Owner edit"}).status_code == 403
    assert owner.delete(f"/api/v1/journal-entries/{entry_id}").status_code == 403
    assert outsider.get(endpoint).status_code == 404
    assert outsider.patch(f"/api/v1/journal-entries/{entry_id}", json={"content": "No access"}).status_code == 404
    assert outsider.get(f"{endpoint}/statistics").status_code == 404

    assert owner.delete(f"/api/v1/trips/{trip_id}/members/{member_user['id']}").status_code == 204
    assert member.get(endpoint).status_code == 404
    assert member.get(f"{endpoint}/statistics").status_code == 404
    assert member.patch(f"/api/v1/journal-entries/{entry_id}", json={"content": "No longer a member"}).status_code == 404
