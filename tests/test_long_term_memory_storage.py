from __future__ import annotations

import memory.long_term as long_term


def test_long_term_memory_uses_configured_chroma_directory(monkeypatch):
    paths = []

    class FakeClient:
        def get_or_create_collection(self, name):
            return name

    def fake_persistent_client(path):
        paths.append(path)
        return FakeClient()

    monkeypatch.setenv("CHROMA_PERSIST_DIRECTORY", "D:/persistent/chroma")
    monkeypatch.setattr(long_term.chromadb, "PersistentClient", fake_persistent_client)

    memory = long_term.LongTermMemory()

    assert paths == ["D:/persistent/chroma"]
    assert memory.collection == "trip_preferences"
