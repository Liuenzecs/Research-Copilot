from __future__ import annotations

from datetime import date

from sqlalchemy import Boolean, Date, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.db.base import Base, TimestampMixin


class ReflectionRecord(TimestampMixin, Base):
    __tablename__ = 'reflections'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reflection_type: Mapped[str] = mapped_column(String(30), index=True)
    related_paper_id: Mapped[int | None] = mapped_column(ForeignKey('papers.id'), nullable=True, index=True)
    related_summary_id: Mapped[int | None] = mapped_column(ForeignKey('summaries.id'), nullable=True, index=True)
    related_repo_id: Mapped[int | None] = mapped_column(ForeignKey('repos.id'), nullable=True, index=True)
    related_reproduction_id: Mapped[int | None] = mapped_column(ForeignKey('reproductions.id'), nullable=True, index=True)
    related_task_id: Mapped[int | None] = mapped_column(ForeignKey('tasks.id'), nullable=True, index=True)
    template_type: Mapped[str] = mapped_column(String(30), default='paper')
    stage: Mapped[str] = mapped_column(String(30), default='initial')
    lifecycle_status: Mapped[str] = mapped_column(String(20), default='draft', index=True)
    content_structured_json: Mapped[str] = mapped_column(Text, default='{}')
    content_markdown: Mapped[str] = mapped_column(Text, default='')
    is_report_worthy: Mapped[bool] = mapped_column(Boolean, default=False)
    report_summary: Mapped[str] = mapped_column(Text, default='')
    event_date: Mapped[date] = mapped_column(Date, index=True)

    paper = relationship('PaperRecord', back_populates='reflections')
    summary = relationship('SummaryRecord', back_populates='reflections')
    repo = relationship('RepoRecord', back_populates='reflections')
    reproduction = relationship('ReproductionRecord', back_populates='reflections')
    task = relationship('TaskRecord')
