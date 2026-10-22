from datetime import UTC, datetime
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.v1.dependencies as dependencies
import api.v1.knowledge as knowledge
from rag.vector_store import get_knowledge_collection
from tests.rag_test_utils import write_text_pdf


class FakeUsers:
    def __init__(self):
        self.documents = {
            "admin-id": {
                "_id": "admin-id",
                "is_admin": True,
                "is_active": True,
                "created_at": datetime.now(UTC),
            },
            "traveler-id": {
                "_id": "traveler-id",
                "is_admin": False,
                "is_active": True,
                "created_at": datetime.now(UTC),
            },
        }

    def find_one(self, query, projection=None):
        document = self.documents.get(query["_id"])
        if document is None:
            return None
        return {key: value for key, value in document.items() if projection is None or key in projection}

    def update_one(self, query, update, upsert=False):
        document = self.documents.setdefault(query["_id"], {"_id": query["_id"]})
        document.update(update.get("$set", {}))
        if "_id" not in document:
            document.update(update.get("$setOnInsert", {}))


class FakeKnowledgeSources:
    def __init__(self):
        self.document = None

    def find(self, query):
        return FakeKnowledgeCursor()

    def find_one(self, query, projection=None):
        if self.document and query.get("document_id") == self.document.get("document_id"):
            if projection is None:
                return self.document
            return {key: value for key, value in self.document.items() if key in projection}
        return None

    def update_one(self, query, update, upsert=False):
        self.document = {
            **update.get("$setOnInsert", {}),
            **update.get("$set", {}),
        }


class FakeKnowledgeCursor:
    def sort(self, *_args):
        return []


class FakeSupabaseAuth:
    def get_user(self, token):
        user_id = {"admin-token": "admin-id", "traveler-token": "traveler-id"}[token]
        return SimpleNamespace(
            user=SimpleNamespace(
                id=user_id,
                email=f"{user_id}@example.com",
                user_metadata={},
                email_confirmed_at=None,
            )
        )


def _client(monkeypatch, tmp_path):
    database = SimpleNamespace(
        users=FakeUsers(),
        knowledge_sources=FakeKnowledgeSources(),
    )
    monkeypatch.setattr(
        dependencies,
        "_get_supabase_client",
        lambda: SimpleNamespace(auth=FakeSupabaseAuth()),
    )
    monkeypatch.setattr(dependencies, "get_database", lambda: database)
    monkeypatch.setenv("RAG_STORAGE_DIRECTORY", str(tmp_path / "knowledge"))
    app = FastAPI()
    app.include_router(knowledge.router)
    app.include_router(knowledge.user_router)
    return TestClient(app), database


def _upload(client, token, file_content=b"%PDF-1.4 test"):
    return client.post(
        "/api/v1/admin/knowledge/documents",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("guide.pdf", file_content, "application/pdf")},
        data={
            "display_name": "Goa Guide",
            "destination": "Goa",
            "category": "travel_guide",
            "document_type": "destination_guide",
        },
    )


def test_admin_upload_is_authorized_by_mongo_role_and_reaches_ingestion(monkeypatch, tmp_path):
    client, database = _client(monkeypatch, tmp_path)
    source_pdf = tmp_path / "source.pdf"
    write_text_pdf(source_pdf, ["North Goa includes Arambol Beach and coastal trails."])

    class FakeEmbeddingModel:
        def encode(self, texts):
            return [[float(len(text)), 1.0] for text in texts]

    monkeypatch.setattr("rag.embeddings.get_embedding_model", lambda: FakeEmbeddingModel())
    monkeypatch.setenv("CHROMA_PERSIST_DIRECTORY", str(tmp_path / "chroma"))
    monkeypatch.setenv("RAG_COLLECTION_NAME", "admin_upload_test")
    response = _upload(client, "admin-token", source_pdf.read_bytes())

    assert response.status_code == 201
    assert response.json()["status"] == "indexed"
    assert response.json()["id"] == database.knowledge_sources.document["_id"]
    assert response.json()["chunk_count"] > 0
    assert response.json()["page_count"] == 1
    assert database.knowledge_sources.document["display_name"] == "Goa Guide"
    assert database.knowledge_sources.document["file_path"].endswith("guide.pdf")
    assert database.users.documents["admin-id"]["is_admin"] is True
    indexed = get_knowledge_collection().get(
        where={"document_id": response.json()["document_id"]},
        include=["documents", "metadatas"],
    )
    assert indexed["documents"]
    assert "Arambol Beach" in indexed["documents"][0]
    assert indexed["metadatas"][0]["destination"] == "goa"


def test_non_admin_and_unauthenticated_users_cannot_upload(monkeypatch, tmp_path):
    client, _ = _client(monkeypatch, tmp_path)
    ingestion_calls = []
    monkeypatch.setattr(knowledge, "ingest_pdf", lambda *args, **kwargs: ingestion_calls.append(args))

    normal_auth = client.get(
        "/api/v1/knowledge",
        headers={"Authorization": "Bearer traveler-token"},
    )
    unauthorized = client.post(
        "/api/v1/admin/knowledge/documents",
        files={"file": ("guide.pdf", b"%PDF-1.4 test", "application/pdf")},
        data={
            "display_name": "Goa Guide",
            "destination": "Goa",
            "category": "travel_guide",
            "document_type": "destination_guide",
        },
    )
    forbidden = _upload(client, "traveler-token")

    assert normal_auth.status_code == 200
    assert unauthorized.status_code == 401
    assert forbidden.status_code == 403
    assert ingestion_calls == []
