from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.db.memory_record import MemoryItemRecord
from app.services.rag.query import semantic_query


class MemoryRetriever:
    def retrieve(self, db: Session, query: str, top_k: int = 10, memory_types: list[str] | None = None, layers: list[str] | None = None):
        stmt = select(MemoryItemRecord).where(MemoryItemRecord.archived.is_(False))
        if memory_types:
            stmt = stmt.where(MemoryItemRecord.memory_type.in_(memory_types))
        if layers:
            stmt = stmt.where(MemoryItemRecord.layer.in_(layers))

        rows = db.execute(stmt).scalars().all()
        semantic_hits = semantic_query(query, top_k=top_k)
        by_id = {row.id: row for row in rows}

        merged: list[dict] = []
        for hit in semantic_hits:
            memory_item_id = int(str(hit.get('id', '0')).split(':', maxsplit=1)[0])
            row = by_id.get(memory_item_id)
            if row is None:
                continue
            merged.append(
                {
                    'id': row.id,
                    'memory_type': row.memory_type,
                    'layer': row.layer,
                    'ref_table': row.ref_table,
                    'ref_id': row.ref_id,
                    'text_content': row.text_content,
                    'importance': row.importance,
                    'pinned': row.pinned,
                    'archived': row.archived,
                    'created_at': row.created_at,
                    'updated_at': row.updated_at,
                    'distance': float(hit.get('distance', 0.0)),
                }
            )

        if not merged:
            merged = [
                {
                    'id': row.id,
                    'memory_type': row.memory_type,
                    'layer': row.layer,
                    'ref_table': row.ref_table,
                    'ref_id': row.ref_id,
                    'text_content': row.text_content,
                    'importance': row.importance,
                    'pinned': row.pinned,
                    'archived': row.archived,
                    'created_at': row.created_at,
                    'updated_at': row.updated_at,
                    'distance': 0.0,
                }
                for row in rows[:top_k]
            ]
        return merged


memory_retriever = MemoryRetriever()
