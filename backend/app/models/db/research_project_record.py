from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.db.base import Base, TimestampMixin


class ResearchProjectRecord(TimestampMixin, Base):
    __tablename__ = 'research_projects'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(Text)
    research_question: Mapped[str] = mapped_column(Text)
    goal: Mapped[str] = mapped_column(Text, default='')
    status: Mapped[str] = mapped_column(String(20), default='active', index=True)
    seed_query: Mapped[str] = mapped_column(Text, default='')
    last_opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    papers = relationship('ResearchProjectPaperRecord', back_populates='project', cascade='all,delete-orphan')
    evidence_items = relationship('ResearchProjectEvidenceItemRecord', back_populates='project', cascade='all,delete-orphan')
    outputs = relationship('ResearchProjectOutputRecord', back_populates='project', cascade='all,delete-orphan')


class ResearchProjectPaperRecord(TimestampMixin, Base):
    __tablename__ = 'research_project_papers'
    __table_args__ = (UniqueConstraint('project_id', 'paper_id', name='uq_research_project_paper'),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey('research_projects.id'), index=True)
    paper_id: Mapped[int] = mapped_column(ForeignKey('papers.id'), index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    selection_reason: Mapped[str] = mapped_column(Text, default='')

    project = relationship('ResearchProjectRecord', back_populates='papers')
    paper = relationship('PaperRecord')


class ResearchProjectEvidenceItemRecord(TimestampMixin, Base):
    __tablename__ = 'research_project_evidence_items'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey('research_projects.id'), index=True)
    paper_id: Mapped[int | None] = mapped_column(ForeignKey('papers.id'), nullable=True, index=True)
    summary_id: Mapped[int | None] = mapped_column(ForeignKey('summaries.id'), nullable=True, index=True)
    paragraph_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    kind: Mapped[str] = mapped_column(String(20), default='claim', index=True)
    excerpt: Mapped[str] = mapped_column(Text, default='')
    note_text: Mapped[str] = mapped_column(Text, default='')
    source_label: Mapped[str] = mapped_column(Text, default='')
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    project = relationship('ResearchProjectRecord', back_populates='evidence_items')
    paper = relationship('PaperRecord')
    summary = relationship('SummaryRecord')


class ResearchProjectOutputRecord(TimestampMixin, Base):
    __tablename__ = 'research_project_outputs'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey('research_projects.id'), index=True)
    output_type: Mapped[str] = mapped_column(String(40), index=True)
    title: Mapped[str] = mapped_column(Text)
    content_json: Mapped[str] = mapped_column(Text, default='{}')
    content_markdown: Mapped[str] = mapped_column(Text, default='')
    status: Mapped[str] = mapped_column(String(20), default='draft', index=True)

    project = relationship('ResearchProjectRecord', back_populates='outputs')
