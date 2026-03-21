from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
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
    saved_searches = relationship('ResearchProjectSavedSearchRecord', back_populates='project', cascade='all,delete-orphan')
    search_runs = relationship('ResearchProjectSearchRunRecord', back_populates='project', cascade='all,delete-orphan')


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


class ResearchProjectSavedSearchRecord(TimestampMixin, Base):
    __tablename__ = 'research_project_saved_searches'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey('research_projects.id'), index=True)
    title: Mapped[str] = mapped_column(Text, default='')
    query: Mapped[str] = mapped_column(Text, default='')
    filters_json: Mapped[str] = mapped_column(Text, default='{}')
    search_mode: Mapped[str] = mapped_column(String(20), default='manual', index=True)
    user_need: Mapped[str] = mapped_column(Text, default='')
    selection_profile: Mapped[str] = mapped_column(String(30), default='balanced')
    target_count: Mapped[int] = mapped_column(Integer, default=0)
    sort_mode: Mapped[str] = mapped_column(String(30), default='relevance', index=True)
    last_run_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    last_result_count: Mapped[int] = mapped_column(Integer, default=0)

    project = relationship('ResearchProjectRecord', back_populates='saved_searches')
    candidates = relationship('ResearchProjectSavedSearchCandidateRecord', back_populates='saved_search', cascade='all,delete-orphan')


class ResearchProjectSearchRunRecord(Base):
    __tablename__ = 'research_project_search_runs'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey('research_projects.id'), index=True)
    saved_search_id: Mapped[int | None] = mapped_column(ForeignKey('research_project_saved_searches.id'), nullable=True, index=True)
    query: Mapped[str] = mapped_column(Text, default='')
    filters_json: Mapped[str] = mapped_column(Text, default='{}')
    sort_mode: Mapped[str] = mapped_column(String(30), default='relevance', index=True)
    result_count: Mapped[int] = mapped_column(Integer, default=0)
    warnings_json: Mapped[str] = mapped_column(Text, default='[]')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    project = relationship('ResearchProjectRecord', back_populates='search_runs')
    saved_search = relationship('ResearchProjectSavedSearchRecord', foreign_keys=[saved_search_id])


class ResearchProjectSavedSearchCandidateRecord(TimestampMixin, Base):
    __tablename__ = 'research_project_saved_search_candidates'
    __table_args__ = (UniqueConstraint('saved_search_id', 'paper_id', name='uq_research_project_saved_search_candidate'),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    saved_search_id: Mapped[int] = mapped_column(ForeignKey('research_project_saved_searches.id'), index=True)
    paper_id: Mapped[int] = mapped_column(ForeignKey('papers.id'), index=True)
    rank_position: Mapped[int] = mapped_column(Integer, default=0)
    rank_score: Mapped[float] = mapped_column(Float, default=0.0)
    reason_json: Mapped[str] = mapped_column(Text, default='{}')
    ai_reason_text: Mapped[str] = mapped_column(Text, default='')
    triage_status: Mapped[str] = mapped_column(String(20), default='new', index=True)
    selected_by_ai: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    selection_bucket: Mapped[str] = mapped_column(String(30), default='', index=True)
    selection_rank: Mapped[int | None] = mapped_column(Integer, nullable=True)
    first_seen_run_id: Mapped[int | None] = mapped_column(ForeignKey('research_project_search_runs.id'), nullable=True, index=True)
    last_seen_run_id: Mapped[int | None] = mapped_column(ForeignKey('research_project_search_runs.id'), nullable=True, index=True)

    saved_search = relationship('ResearchProjectSavedSearchRecord', back_populates='candidates')
    paper = relationship('PaperRecord')
    first_seen_run = relationship('ResearchProjectSearchRunRecord', foreign_keys=[first_seen_run_id])
    last_seen_run = relationship('ResearchProjectSearchRunRecord', foreign_keys=[last_seen_run_id])
