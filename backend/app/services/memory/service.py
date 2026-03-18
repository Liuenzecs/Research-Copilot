from __future__ import annotations

from sqlalchemy import desc, select
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
from app.services.project.scopes import append_project_id, get_project_scope_ids, ref_belongs_to_project
from app.services.rag.ingestor import ingest_memory


class MemoryService:
    def _resolve_jump_target(self, db: Session, ref_table: str, ref_id: int | None, project_id: int | None = None) -> dict | None:
        if not ref_id:
            return None

        if ref_table == 'papers':
            paper = db.get(PaperRecord, ref_id)
            if paper is None:
                return None
            return {'kind': 'paper', 'path': append_project_id(f'/papers/{paper.id}', project_id)}

        if ref_table == 'summaries':
            summary = db.get(SummaryRecord, ref_id)
            if summary is None:
                return None
            return {'kind': 'paper', 'path': append_project_id(f'/papers/{summary.paper_id}?summary_id={summary.id}', project_id)}

        if ref_table == 'reproductions':
            reproduction = db.get(ReproductionRecord, ref_id)
            if reproduction is None:
                return None
            return {'kind': 'reproduction', 'path': append_project_id(f'/reproduction?reproduction_id={reproduction.id}', project_id)}

        if ref_table == 'reflections':
            reflection = db.get(ReflectionRecord, ref_id)
            if reflection is None:
                return None
            return {'kind': 'reflection', 'path': append_project_id(f'/reflections?reflection_id={reflection.id}', project_id)}

        if ref_table == 'repos':
            repo = db.get(RepoRecord, ref_id)
            if repo is None or repo.paper_id is None:
                return None
            return {'kind': 'reproduction', 'path': append_project_id(f'/reproduction?paper_id={repo.paper_id}', project_id)}

        if ref_table == 'ideas':
            idea = db.get(IdeaRecord, ref_id)
            if idea is None:
                return None
            return {'kind': 'brainstorm', 'path': '/brainstorm'}

        return None

    def _resolve_context_hint(self, ref_table: str, jump_target: dict | None) -> str | None:
        if ref_table == 'papers':
            return '关联论文，建议回到论文工作区继续阅读'
        if ref_table == 'summaries':
            return '关联摘要，建议回到所属论文工作区继续阅读'
        if ref_table == 'reproductions':
            return '关联复现记录，建议回到复现工作区继续推进'
        if ref_table == 'reflections':
            return '关联心得，建议回到心得页面继续整理'
        if ref_table == 'repos':
            if jump_target is None:
                return None
            return '关联代码仓对应的复现上下文，建议回到复现工作区继续推进'
        if ref_table == 'ideas':
            return '关联灵感记录，建议回到灵感页面继续扩展'
        return None

    def _attach_presentation_fields(self, db: Session, row: dict, project_id: int | None = None) -> dict:
        payload = dict(row)
        jump_target = self._resolve_jump_target(db, payload.get('ref_table', ''), payload.get('ref_id'), project_id=project_id)
        retrieval_mode = payload.get('retrieval_mode') or 'fallback'
        payload['jump_target'] = jump_target
        payload['retrieval_mode'] = retrieval_mode
        payload['match_reason'] = payload.get('match_reason') or (
            '与当前检索问题语义接近'
            if retrieval_mode == 'semantic'
            else '当前语义召回不足，按记忆重要度与最近性回退展示'
        )
        payload['context_hint'] = self._resolve_context_hint(payload.get('ref_table', ''), jump_target)
        return payload

    def _filter_project_rows(self, db: Session, rows: list[dict], project_id: int | None) -> list[dict]:
        if project_id is None:
            return rows
        scope = get_project_scope_ids(db, project_id)
        return [row for row in rows if ref_belongs_to_project(scope, str(row.get('ref_table', '')), row.get('ref_id'))]

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

    def query(
        self,
        db: Session,
        query: str,
        top_k: int,
        memory_types: list[str],
        layers: list[str],
        project_id: int | None = None,
    ) -> list[dict]:
        rows = memory_retriever.retrieve(db, query, top_k=top_k, memory_types=memory_types, layers=layers)
        ranked_rows = rank_memories(rows)
        filtered_rows = self._filter_project_rows(db, ranked_rows, project_id)
        return [self._attach_presentation_fields(db, row, project_id=project_id) for row in filtered_rows[:top_k]]

    def list_recent(
        self,
        db: Session,
        limit: int,
        memory_types: list[str],
        layers: list[str],
        project_id: int | None = None,
    ) -> list[dict]:
        stmt = select(MemoryItemRecord).where(MemoryItemRecord.archived.is_(False))
        if memory_types:
            stmt = stmt.where(MemoryItemRecord.memory_type.in_(memory_types))
        if layers:
            stmt = stmt.where(MemoryItemRecord.layer.in_(layers))

        stmt = stmt.order_by(desc(MemoryItemRecord.updated_at), desc(MemoryItemRecord.id)).limit(limit)
        rows = db.execute(stmt).scalars().all()

        payloads: list[dict] = []
        for row in rows:
            payloads.append(
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
                    'retrieval_mode': 'fallback',
                    'match_reason': '当前展示的是最近写入的长期记忆，方便你快速确认记忆是否已保存。',
                }
            )
        filtered_rows = self._filter_project_rows(db, payloads, project_id)
        return [self._attach_presentation_fields(db, row, project_id=project_id) for row in filtered_rows[:limit]]

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
