from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.db.base import Base, TimestampMixin


class SummaryRecord(TimestampMixin, Base):
    __tablename__ = 'summaries'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    paper_id: Mapped[int] = mapped_column(ForeignKey('papers.id'), index=True)
    summary_type: Mapped[str] = mapped_column(String(20), index=True)
    content_en: Mapped[str] = mapped_column(Text)
    problem_en: Mapped[str] = mapped_column(Text, default='')
    method_en: Mapped[str] = mapped_column(Text, default='')
    contributions_en: Mapped[str] = mapped_column(Text, default='')
    limitations_en: Mapped[str] = mapped_column(Text, default='')
    future_work_en: Mapped[str] = mapped_column(Text, default='')
    provider: Mapped[str] = mapped_column(String(50), default='heuristic')
    model: Mapped[str] = mapped_column(String(100), default='local')

    paper = relationship('PaperRecord', back_populates='summaries')
    reflections = relationship('ReflectionRecord', back_populates='summary')
