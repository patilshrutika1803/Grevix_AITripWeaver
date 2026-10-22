from rag.generation import GroundedAnswer, GroundedSource, generate_grounded_answer
from rag.ingestion import ingest_pdf
from rag.retrieval import retrieve_documents_with_quality
from tests.rag_test_utils import write_text_pdf
from tests.test_rag_quality import FakeEmbeddingModel, SequencedCollection, _item


class KnownDocumentEmbeddingModel:
    def encode(self, texts):
        return [
            [1.0, 0.0] if "north goa" in text.casefold() else [0.0, 1.0]
            for text in texts
        ]


def test_controlled_end_to_end_goa_question_stays_in_travel_knowledge(monkeypatch):
    collection = SequencedCollection([[_item(distance=0.2)]])
    monkeypatch.setattr(
        "rag.generation.invoke_with_fallback",
        lambda *_args, **_kwargs: GroundedAnswer(
            answer="The retrieved Goa guide mentions North Goa beaches.",
            sources=[{
                "document_id": "doc-1", "filename": "guide.pdf", "source": "guide.pdf",
                "page": 1, "chunk_index": 0, "destination": "Goa", "category": "travel_guide",
                "document_type": "destination_guide",
            }], grounded=True, query="wrong", retrieved_document_count=99,
        ),
    )

    quality = retrieve_documents_with_quality(
        "What are the best beaches in North Goa?",
        collection=collection,
        embedding_model=FakeEmbeddingModel(),
    )
    answer = generate_grounded_answer(quality.query, quality.retrieved_documents)

    assert "Goa" in answer.answer
    assert answer.grounded is True
    assert answer.sources[0].filename == "guide.pdf"
    assert answer.sources[0].page == 1
    assert collection.queries[0]["include"] == ["documents", "metadatas", "distances"]
    assert collection.queries[0].get("where") is None


def test_indexed_known_document_is_retrieved_and_used_as_answer_context(
    tmp_path, monkeypatch
):
    question = "What is a beach named in North Goa?"
    known_fact = "North Goa guide: Arambol Beach is known for its cliffside sunset views."
    pdf_path = tmp_path / "goa-guide.pdf"
    write_text_pdf(pdf_path, [known_fact])
    embedding_model = KnownDocumentEmbeddingModel()
    chroma_path = tmp_path / "chroma"

    monkeypatch.setenv("CHROMA_PERSIST_DIRECTORY", str(chroma_path))
    monkeypatch.setenv("RAG_COLLECTION_NAME", "known_document_test")
    monkeypatch.setenv("RAG_CHUNK_SIZE", "500")
    monkeypatch.setenv("RAG_CHUNK_OVERLAP", "60")

    indexed = ingest_pdf(
        pdf_path,
        destination="Goa",
        category="travel_guide",
        document_type="destination_guide",
        embedding_model=embedding_model,
    )
    reindexed = ingest_pdf(
        pdf_path,
        destination="Goa",
        category="travel_guide",
        document_type="destination_guide",
        embedding_model=embedding_model,
    )

    quality = retrieve_documents_with_quality(
        question,
        destination="Goa",
        category="travel_guide",
        document_type="destination_guide",
        embedding_model=embedding_model,
        max_attempts=1,
    )

    assert indexed == reindexed
    assert quality.relevance_status == "strong"
    assert quality.number_of_results == 1
    assert known_fact in quality.retrieved_documents[0].content

    document = quality.retrieved_documents[0]
    provider_call = {}

    def answer_from_context(_chain_builder, messages, **_kwargs):
        provider_call["prompt"] = messages[-1].content
        return GroundedAnswer(
            answer="The guide names Arambol Beach for its cliffside sunset views.",
            sources=[
                GroundedSource(
                    document_id=document.document_id,
                    filename=document.filename,
                    source=document.source,
                    page=document.page,
                    chunk_index=document.chunk_index,
                    destination=document.destination,
                    category=document.category,
                    document_type=document.document_type,
                )
            ],
            grounded=True,
            query=question,
            retrieved_document_count=1,
        )

    monkeypatch.setattr("rag.generation.invoke_with_fallback", answer_from_context)
    answer = generate_grounded_answer(
        question,
        quality.retrieved_documents,
        retrieval_status=quality.relevance_status,
    )

    assert known_fact in provider_call["prompt"]
    assert answer.grounded is True
    assert "Arambol Beach" in answer.answer
    assert answer.sources[0].filename == "goa-guide.pdf"
    assert answer.sources[0].page == 1
