from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.db.memory_record import MemoryLinkRecord


class MemoryLinker:
    def link(self, db: Session, from_id: int, to_id: int, link_type: str, weight: float) -> MemoryLinkRecord:
        link = MemoryLinkRecord(from_memory_id=from_id, to_memory_id=to_id, link_type=link_type, weight=weight)
        db.add(link)
        db.commit()
        db.refresh(link)
        return link


memory_linker = MemoryLinker()
