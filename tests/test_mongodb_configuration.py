from __future__ import annotations

from typing import Any

import pytest

import database.mongodb as mongodb


class FakeCollection:
    def __init__(self) -> None:
        self.indexes: list[tuple[Any, ...]] = []

    def create_index(self, *args: Any, **kwargs: Any) -> None:
        self.indexes.append(args)


class FakeDatabase:
    def __init__(self) -> None:
        self.collections: dict[str, FakeCollection] = {}

    def __getattr__(self, name: str) -> FakeCollection:
        return self.collections.setdefault(name, FakeCollection())

    def __getitem__(self, name: str) -> FakeCollection:
        return self.__getattr__(name)


class FakeClient:
    def __init__(self, ping_error: Exception | None = None) -> None:
        self.admin = type("Admin", (), {"command": self.command})()
        self.ping_error = ping_error
        self.closed = False
        self.database = FakeDatabase()

    def command(self, name: str) -> dict[str, int]:
        assert name == "ping"
        if self.ping_error:
            raise self.ping_error
        return {"ok": 1}

    def __getitem__(self, name: str) -> FakeDatabase:
        assert name == "pack_go"
        return self.database

    def close(self) -> None:
        self.closed = True


@pytest.fixture(autouse=True)
def reset_mongodb_state(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mongodb, "_client", None)
    monkeypatch.setattr(mongodb, "_database", None)


def test_missing_mongodb_configuration_is_reported(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MONGODB_URI", raising=False)
    monkeypatch.delenv("MONGODB_DATABASE", raising=False)

    with pytest.raises(RuntimeError, match="MONGODB_URI must be configured"):
        mongodb.get_database()


def test_mongodb_ping_failure_is_sanitized_and_closes_client(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from pymongo.errors import ServerSelectionTimeoutError

    client = FakeClient(ServerSelectionTimeoutError("contains-private-connection-details"))
    monkeypatch.setenv("MONGODB_URI", "mongodb://user:private@host/pack_go")
    monkeypatch.setenv("MONGODB_DATABASE", "pack_go")
    monkeypatch.setattr(mongodb, "MongoClient", lambda *args, **kwargs: client)

    with pytest.raises(RuntimeError, match="MongoDB initialization failed") as error:
        mongodb.get_database()

    assert "private" not in str(error.value)
    assert client.closed


def test_successful_ping_initializes_application_collections_and_indexes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = FakeClient()
    monkeypatch.setenv("MONGODB_URI", "mongodb://localhost/pack_go")
    monkeypatch.setenv("MONGODB_DATABASE", "pack_go")
    monkeypatch.setattr(mongodb, "MongoClient", lambda *args, **kwargs: client)

    database = mongodb.get_database()

    assert database is client.database
    assert {"users", "trips", "trip_messages", "notifications", "expenses", "journal_entries", "knowledge_sources"} <= set(
        database.collections
    )
    assert client.database.trips.indexes == [("user_id",), ("members.user_id",)]
    assert not client.closed
