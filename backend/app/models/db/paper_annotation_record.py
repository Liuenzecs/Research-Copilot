from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.db.base import Base, TimestampMixin


class PaperAnnotationRecord(TimestampMixin, Base):
    __tablename__ = 'paper_annotations'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    paper_id: Mapped[int] = mapped_column(ForeignKey('papers.id'), index=True)
    paragraph_id: Mapped[int] = mapped_column(Integer, index=True)
    selected_text: Mapped[str] = mapped_column(Text, default='')
    note_text: Mapped[str] = mapped_column(Text, default='')

    paper = relationship('PaperRecord', back_populates='annotations')
