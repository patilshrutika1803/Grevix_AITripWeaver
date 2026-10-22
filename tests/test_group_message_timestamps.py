import base64
from datetime import UTC, datetime
from types import SimpleNamespace

from bson import BSON

from api.v1.collaboration import (
    _message_cursor,
    _parse_message_cursor,
    get_messages,
    message_out,
)
from services.collaboration_service import CollaborationService


def _message(created_at, **timestamps):
    return {
        "_id": "message-1",
        "id": "message-1",
        "trip_id": "trip-1",
        "sender_user_id": "user-1",
        "body": "Ready to go",
        "created_at": created_at,
        "edited_at": timestamps.get("edited_at"),
        "deleted_at": timestamps.get("deleted_at"),
    }


def test_created_message_survives_bson_storage_and_api_serialization_as_utc(monkeypatch):
    created_at = datetime(2026, 10, 13, 9, 30, tzinfo=UTC)
    trip = {
        "_id": "trip-1",
        "is_group": True,
        "members": [{"user_id": "user-1", "status": "active", "role": "owner"}],
    }

    class Collection:
        def __init__(self, document=None):
            self.document = document

        def find_one(self, *_args, **_kwargs):
            return self.document

        def insert_one(self, document):
            self.document = document

    class Database:
        trips = Collection(trip)
        users = Collection({"_id": "user-1", "name": "Alex"})
        trip_messages = Collection()

    database = Database()
    monkeypatch.setattr("services.collaboration_service.now", lambda: created_at)
    monkeypatch.setattr("services.collaboration_service.active_recipient_ids", lambda *_args: [])
    monkeypatch.setattr("services.collaboration_service.notify", lambda *_args: None)

    created = CollaborationService(database).message("trip-1", "user-1", "Ready to go")
    assert created["created_at"] == created_at
    assert created["created_at"].utcoffset().total_seconds() == 0

    stored = BSON.encode(created).decode()
    assert stored["created_at"].tzinfo is None

    response = message_out(stored, "Alex")
    serialized = response.model_dump(mode="json")

    assert response.created_at == created_at
    assert serialized["created_at"] == "2026-10-13T09:30:00Z"
    assert serialized["sender_name"] == "Alex"


def test_message_out_normalizes_explicit_offsets_and_legacy_naive_dates():
    response = message_out(
        _message(
            datetime.fromisoformat("2026-10-13T15:00:00+05:30"),
            edited_at=datetime.fromisoformat("2026-10-13T11:00:00+02:00"),
            deleted_at=datetime.fromisoformat("2026-10-13T18:00:00+09:00"),
        ),
        "Alex",
    )

    assert response.created_at == datetime(2026, 10, 13, 9, 30, tzinfo=UTC)
    assert response.edited_at == datetime(2026, 10, 13, 9, 0, tzinfo=UTC)
    assert response.deleted_at == datetime(2026, 10, 13, 9, 0, tzinfo=UTC)

    legacy_response = message_out(_message(datetime(2026, 10, 13, 9, 30)), "Alex")
    assert legacy_response.created_at == datetime(2026, 10, 13, 9, 30, tzinfo=UTC)


def test_message_cursors_are_utc_and_keep_legacy_naive_cursor_instants():
    created_at = datetime(2026, 10, 13, 15, 0, tzinfo=UTC)

    cursor = _message_cursor(created_at, "message-1")
    assert _parse_message_cursor(cursor) == (created_at, "message-1")

    legacy_cursor = base64.urlsafe_b64encode(
        b"2026-10-13T15:00:00|message-1"
    ).decode()
    assert _parse_message_cursor(legacy_cursor) == (created_at, "message-1")


def test_message_retrieval_preserves_ascending_timestamp_order():
    timestamps = [
        datetime(2026, 10, 13, 9, 0),
        datetime(2026, 10, 13, 9, 5),
        datetime(2026, 10, 13, 9, 10),
    ]
    messages = [
        _message(timestamp) | {"id": f"message-{index}", "_id": f"message-{index}"}
        for index, timestamp in enumerate(timestamps)
    ]

    class Cursor:
        def __init__(self, documents):
            self.documents = documents

        def sort(self, fields):
            assert fields == [("created_at", -1), ("_id", -1)]
            self.documents.sort(key=lambda item: (item["created_at"], item["_id"]), reverse=True)
            return self

        def limit(self, count):
            self.documents = self.documents[:count]
            return self

        def __iter__(self):
            return iter(self.documents)

    class Collection:
        def __init__(self, document=None, documents=None):
            self.document = document
            self.documents = documents

        def find_one(self, *_args, **_kwargs):
            return self.document

        def find(self, _query):
            return Cursor(list(self.documents))

    database = SimpleNamespace(
        trips=Collection({
            "_id": "trip-1",
            "is_group": True,
            "members": [{"user_id": "user-1", "status": "active", "role": "owner"}],
        }),
        users=Collection({"_id": "user-1", "name": "Alex"}),
        trip_messages=Collection(documents=messages),
    )

    result = get_messages(
        "trip-1",
        limit=10,
        cursor=None,
        db=database,
        user=SimpleNamespace(id="user-1"),
    )

    assert [message.id for message in result.messages] == [
        "message-0",
        "message-1",
        "message-2",
    ]
    assert [message.created_at for message in result.messages] == [
        timestamp.replace(tzinfo=UTC) for timestamp in timestamps
    ]
