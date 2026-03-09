from __future__ import annotations

from app.services.rag.vector_store import vector_store


def semantic_query(text: str, top_k: int = 5) -> list[dict]:
    return vector_store.query(query_text=text, top_k=top_k)
