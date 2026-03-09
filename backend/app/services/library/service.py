from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.db.paper_record import PaperRecord
from app.models.db.reflection_record import ReflectionRecord
from app.models.db.summary_record import SummaryRecord
from app.services.library.indexing import build_paper_index_item


class LibraryService:
    def list_library(self, db: Session) -> dict:
        papers = db.execute(select(PaperRecord).order_by(PaperRecord.created_at.desc())).scalars().all()
        paper_items = [build_paper_index_item(p, p.research_state) for p in papers]

        summary_counts: dict[int, int] = {}
        for row in db.execute(select(SummaryRecord.paper_id)).all():
            summary_counts[row[0]] = summary_counts.get(row[0], 0) + 1

        reflection_counts: dict[int, int] = {}
        for row in db.execute(select(ReflectionRecord.related_paper_id)).all():
            if row[0] is None:
                continue
            reflection_counts[row[0]] = reflection_counts.get(row[0], 0) + 1

        for item in paper_items:
            item['summary_count'] = summary_counts.get(item['id'], 0)
            item['reflection_count'] = reflection_counts.get(item['id'], 0)

        return {'items': paper_items, 'total': len(paper_items)}


library_service = LibraryService()
