from __future__ import annotations

from app.services.rag.vector_store import vector_store


def ingest_memory(memory_item_id: int, text: str, metadata: dict) -> None:
    vector_store.add(vector_id=f'{memory_item_id}:0', text=text, metadata=metadata)
