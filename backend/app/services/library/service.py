from __future__ import annotations

from datetime import date, datetime, time, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.db.memory_record import MemoryItemRecord
from app.models.db.paper_record import PaperRecord
from app.models.db.reflection_record import ReflectionRecord
from app.models.db.reproduction_record import ReproductionRecord
from app.models.db.summary_record import SummaryRecord
from app.services.library.indexing import build_paper_index_item


def _as_utc(value: datetime | date | None) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return datetime.combine(value, time.min, tzinfo=timezone.utc)
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


class LibraryService:
    def list_library(self, db: Session) -> dict:
        papers = db.execute(select(PaperRecord).order_by(PaperRecord.created_at.desc())).scalars().all()
        paper_items = [build_paper_index_item(paper, paper.research_state) for paper in papers]
        by_id = {item['id']: item for item in paper_items}

        summary_rows = db.execute(select(SummaryRecord.paper_id, SummaryRecord.updated_at)).all()
        for paper_id, updated_at in summary_rows:
            item = by_id.get(paper_id)
            if item is None:
                continue
            item['summary_count'] += 1
            self._update_last_activity(item, _as_utc(updated_at), '生成摘要')

        reflection_rows = db.execute(
            select(ReflectionRecord.related_paper_id, ReflectionRecord.updated_at, ReflectionRecord.event_date)
        ).all()
        for paper_id, updated_at, event_date in reflection_rows:
            if paper_id is None:
                continue
            item = by_id.get(paper_id)
            if item is None:
                continue
            item['reflection_count'] += 1
            self._update_last_activity(item, _as_utc(updated_at) or _as_utc(event_date), '记录心得')

        reproduction_rows = db.execute(select(ReproductionRecord.paper_id, ReproductionRecord.updated_at)).all()
        for paper_id, updated_at in reproduction_rows:
            if paper_id is None:
                continue
            item = by_id.get(paper_id)
            if item is None:
                continue
            item['reproduction_count'] += 1
            self._update_last_activity(item, _as_utc(updated_at), '推进复现')

        memory_rows = db.execute(
            select(MemoryItemRecord.ref_id, MemoryItemRecord.updated_at)
            .where(MemoryItemRecord.ref_table == 'papers')
            .where(MemoryItemRecord.archived.is_(False))
        ).all()
        for paper_id, updated_at in memory_rows:
            if paper_id is None:
                continue
            item = by_id.get(paper_id)
            if item is None:
                continue
            item['memory_count'] += 1
            item['in_memory'] = True
            self._update_last_activity(item, _as_utc(updated_at), '推入记忆')

        for paper in papers:
            item = by_id[paper.id]
            state = paper.research_state

            if item['is_downloaded']:
                self._update_last_activity(item, _as_utc(paper.updated_at), '下载 PDF')
            else:
                self._update_last_activity(item, _as_utc(paper.created_at), '已加入文献库')

            if state is not None:
                self._update_last_activity(item, _as_utc(state.last_opened_at), '最近阅读')
                if state.updated_at and (
                    state.reading_status != 'unread'
                    or state.repro_interest not in {'', 'none'}
                    or bool(state.is_core_paper)
                ):
                    self._update_last_activity(item, _as_utc(state.updated_at), '更新阅读状态')

            item['is_my_library'] = bool(
                item['is_downloaded']
                or item['in_memory']
                or item['summary_count'] > 0
                or item['reflection_count'] > 0
                or item['reproduction_count'] > 0
                or (state is not None and state.last_opened_at is not None)
                or (state is not None and state.reading_status != 'unread')
            )

        sorted_items = sorted(
            paper_items,
            key=lambda item: (
                item['is_my_library'],
                _as_utc(item['last_activity_at']) or datetime.min.replace(tzinfo=timezone.utc),
                item['id'],
            ),
            reverse=True,
        )
        return {'items': sorted_items, 'total': len(sorted_items)}

    @staticmethod
    def _update_last_activity(item: dict, candidate_time: datetime | None, label: str) -> None:
        if candidate_time is None:
            return
        current = _as_utc(item.get('last_activity_at'))
        if current is None or candidate_time >= current:
            item['last_activity_at'] = candidate_time
            item['last_activity_label'] = label


library_service = LibraryService()
