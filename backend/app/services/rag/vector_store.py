from __future__ import annotations

from typing import Any

from app.core.config import get_settings
from app.services.rag.embeddings import embedding_service


class VectorStore:
    def __init__(self) -> None:
        self._collection = None
        self._memory_fallback: dict[str, dict[str, Any]] = {}
        self._last_error = ''

    def ensure_ready(self) -> bool:
        if self._collection is not None:
            return True
        try:
            import chromadb

            settings = get_settings()
            client = chromadb.PersistentClient(path=settings.vector_dir)
            self._collection = client.get_or_create_collection('memory_semantic_v1')
            self._last_error = ''
            return True
        except Exception as exc:
            self._last_error = str(exc)
            return False

    def is_initialized(self) -> bool:
        return self._collection is not None

    def status_snapshot(self) -> dict[str, Any]:
        return {
            'initialized': self._collection is not None,
            'fallback_items': len(self._memory_fallback),
            'last_error': self._last_error,
        }

    def _get_collection(self):
        if self._collection is not None:
            return self._collection
        if self.ensure_ready():
            return self._collection
        return None

    def add(self, vector_id: str, text: str, metadata: dict[str, Any]) -> None:
        emb = embedding_service.embed(text)
        coll = self._get_collection()
        if coll is None:
            self._memory_fallback[vector_id] = {'embedding': emb, 'document': text, 'metadata': metadata}
            return
        coll.upsert(ids=[vector_id], embeddings=[emb], documents=[text], metadatas=[metadata])

    def query(self, query_text: str, top_k: int = 5) -> list[dict[str, Any]]:
        emb = embedding_service.embed(query_text)
        coll = self._get_collection()
        if coll is None:
            values = list(self._memory_fallback.items())[:top_k]
            return [
                {
                    'id': k,
                    'document': v['document'],
                    'metadata': v['metadata'],
                    'distance': 0.0,
                }
                for k, v in values
            ]

        result = coll.query(query_embeddings=[emb], n_results=top_k)
        out: list[dict[str, Any]] = []
        ids = result.get('ids', [[]])[0]
        docs = result.get('documents', [[]])[0]
        metas = result.get('metadatas', [[]])[0]
        dists = result.get('distances', [[]])[0] if result.get('distances') else [0.0] * len(ids)
        for idx, vector_id in enumerate(ids):
            out.append(
                {
                    'id': vector_id,
                    'document': docs[idx] if idx < len(docs) else '',
                    'metadata': metas[idx] if idx < len(metas) else {},
                    'distance': dists[idx] if idx < len(dists) else 0.0,
                }
            )
        return out


vector_store = VectorStore()
