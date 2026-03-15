from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.db.idea_record import IdeaRecord
from app.models.db.memory_record import MemoryItemRecord
from app.models.db.paper_record import PaperRecord
from app.models.db.reflection_record import ReflectionRecord
from app.models.db.repo_record import RepoRecord
from app.models.db.reproduction_record import ReproductionRecord
from app.models.db.summary_record import SummaryRecord
from app.services.memory.linker import memory_linker
from app.services.memory.ranker import rank_memories
from app.services.memory.retriever import memory_retriever
from app.services.rag.ingestor import ingest_memory


class MemoryService:
    def _resolve_jump_target(self, db: Session, ref_table: str, ref_id: int | None) -> dict | None:
        if not ref_id:
            return None

        if ref_table == 'papers':
            paper = db.get(PaperRecord, ref_id)
            if paper is None:
                return None
            return {'kind': 'paper', 'path': f'/search?paper_id={paper.id}'}

        if ref_table == 'summaries':
            summary = db.get(SummaryRecord, ref_id)
            if summary is None:
                return None
            return {'kind': 'paper', 'path': f'/search?paper_id={summary.paper_id}&summary_id={summary.id}'}

        if ref_table == 'reproductions':
            reproduction = db.get(ReproductionRecord, ref_id)
            if reproduction is None:
                return None
            return {'kind': 'reproduction', 'path': f'/reproduction?reproduction_id={reproduction.id}'}

        if ref_table == 'reflections':
            reflection = db.get(ReflectionRecord, ref_id)
            if reflection is None:
                return None
            return {'kind': 'reflection', 'path': f'/reflections?reflection_id={reflection.id}'}

        if ref_table == 'repos':
            repo = db.get(RepoRecord, ref_id)
            if repo is None or repo.paper_id is None:
                return None
            return {'kind': 'reproduction', 'path': f'/reproduction?paper_id={repo.paper_id}'}

        if ref_table == 'ideas':
            idea = db.get(IdeaRecord, ref_id)
            if idea is None:
                return None
            return {'kind': 'brainstorm', 'path': '/brainstorm'}

        return None

    def _attach_jump_target(self, db: Session, row: dict) -> dict:
        payload = dict(row)
        payload['jump_target'] = self._resolve_jump_target(db, payload.get('ref_table', ''), payload.get('ref_id'))
        return payload

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
        ranked_rows = rank_memories(rows)
        return [self._attach_jump_target(db, row) for row in ranked_rows]

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
