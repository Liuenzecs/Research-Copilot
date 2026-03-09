from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.db.memory_record import MemoryItemRecord
from app.services.memory.linker import memory_linker
from app.services.memory.ranker import rank_memories
from app.services.memory.retriever import memory_retriever
from app.services.rag.ingestor import ingest_memory


class MemoryService:
    def create_memory(
        self,
        db: Session,
        *,
        memory_type: str,
        layer: str,
        text_content: str,
        ref_table: str = '',
        ref_id: int | None = None,
        importance: float = 0.5,
    ) -> MemoryItemRecord:
        item = MemoryItemRecord(
            memory_type=memory_type,
            layer=layer,
            text_content=text_content,
            ref_table=ref_table,
            ref_id=ref_id,
            importance=importance,
        )
        db.add(item)
        db.commit()
        db.refresh(item)

        ingest_memory(item.id, text_content, {'memory_item_id': item.id, 'memory_type': memory_type, 'layer': layer})
        return item

    def query(self, db: Session, query: str, top_k: int, memory_types: list[str], layers: list[str]) -> list[dict]:
        rows = memory_retriever.retrieve(db, query, top_k=top_k, memory_types=memory_types, layers=layers)
        return rank_memories(rows)

    def link(self, db: Session, from_memory_id: int, to_memory_id: int, link_type: str, weight: float):
        return memory_linker.link(db, from_memory_id, to_memory_id, link_type, weight)

    def archive(self, db: Session, memory_id: int, archived: bool = True):
        item = db.get(MemoryItemRecord, memory_id)
        if item is None:
            return None
        item.archived = archived
        db.add(item)
        db.commit()
        db.refresh(item)
        return item


memory_service = MemoryService()
