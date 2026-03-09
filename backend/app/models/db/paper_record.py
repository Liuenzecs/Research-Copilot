from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.db.base import Base, TimestampMixin


class PaperRecord(TimestampMixin, Base):
    __tablename__ = 'papers'
    __table_args__ = (UniqueConstraint('source', 'source_id', name='uq_paper_source_sourceid'),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    source: Mapped[str] = mapped_column(String(50), index=True)
    source_id: Mapped[str] = mapped_column(String(255), index=True)
    title_en: Mapped[str] = mapped_column(Text)
    abstract_en: Mapped[str] = mapped_column(Text, default='')
    authors: Mapped[str] = mapped_column(Text, default='')
    year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    venue: Mapped[str] = mapped_column(String(255), default='')
    pdf_url: Mapped[str] = mapped_column(Text, default='')
    pdf_local_path: Mapped[str] = mapped_column(Text, default='')
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    research_state = relationship('PaperResearchStateRecord', back_populates='paper', uselist=False, cascade='all,delete-orphan')
    summaries = relationship('SummaryRecord', back_populates='paper')
    notes = relationship('NoteRecord', back_populates='paper')
    ideas = relationship('IdeaRecord', back_populates='paper')
    repos = relationship('RepoRecord', back_populates='paper')
    reproductions = relationship('ReproductionRecord', back_populates='paper')
    reflections = relationship('ReflectionRecord', back_populates='paper')


class PaperResearchStateRecord(TimestampMixin, Base):
    __tablename__ = 'paper_research_state'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    paper_id: Mapped[int] = mapped_column(ForeignKey('papers.id'), unique=True, index=True)
    reading_status: Mapped[str] = mapped_column(String(20), default='unread', index=True)
    interest_level: Mapped[int] = mapped_column(Integer, default=3)
    repro_interest: Mapped[str] = mapped_column(String(20), default='none')
    user_rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    last_opened_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    topic_cluster: Mapped[str] = mapped_column(String(255), default='')
    is_core_paper: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    paper = relationship('PaperRecord', back_populates='research_state')
