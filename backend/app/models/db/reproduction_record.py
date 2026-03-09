from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.db.base import Base, TimestampMixin


class ReproductionRecord(TimestampMixin, Base):
    __tablename__ = 'reproductions'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    paper_id: Mapped[int | None] = mapped_column(ForeignKey('papers.id'), nullable=True, index=True)
    repo_id: Mapped[int | None] = mapped_column(ForeignKey('repos.id'), nullable=True, index=True)
    plan_markdown: Mapped[str] = mapped_column(Text)
    progress_summary: Mapped[str] = mapped_column(Text, default='')
    progress_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default='planned', index=True)

    paper = relationship('PaperRecord', back_populates='reproductions')
    repo = relationship('RepoRecord', back_populates='reproductions')
    steps = relationship('ReproductionStepRecord', back_populates='reproduction', cascade='all,delete-orphan')
    logs = relationship('ReproductionLogRecord', back_populates='reproduction', cascade='all,delete-orphan')
    reflections = relationship('ReflectionRecord', back_populates='reproduction')


class ReproductionStepRecord(TimestampMixin, Base):
    __tablename__ = 'reproduction_steps'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reproduction_id: Mapped[int] = mapped_column(ForeignKey('reproductions.id'), index=True)
    step_no: Mapped[int] = mapped_column(Integer)
    command: Mapped[str] = mapped_column(Text)
    purpose: Mapped[str] = mapped_column(Text, default='')
    risk_level: Mapped[str] = mapped_column(String(20), default='medium')
    step_status: Mapped[str] = mapped_column(String(20), default='pending', index=True)
    progress_note: Mapped[str] = mapped_column(Text, default='')
    blocker_reason: Mapped[str] = mapped_column(Text, default='')
    blocked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    requires_manual_confirm: Mapped[bool] = mapped_column(Boolean, default=True)
    expected_output: Mapped[str] = mapped_column(Text, default='')

    reproduction = relationship('ReproductionRecord', back_populates='steps')


class ReproductionLogRecord(TimestampMixin, Base):
    __tablename__ = 'reproduction_logs'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reproduction_id: Mapped[int] = mapped_column(ForeignKey('reproductions.id'), index=True)
    step_id: Mapped[int | None] = mapped_column(ForeignKey('reproduction_steps.id'), nullable=True)
    log_text: Mapped[str] = mapped_column(Text)
    error_type: Mapped[str] = mapped_column(String(100), default='')
    next_step_suggestion: Mapped[str] = mapped_column(Text, default='')

    reproduction = relationship('ReproductionRecord', back_populates='logs')
