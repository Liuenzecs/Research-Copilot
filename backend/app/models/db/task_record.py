from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.db.base import Base, TimestampMixin


class TaskRecord(TimestampMixin, Base):
    __tablename__ = 'tasks'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_type: Mapped[str] = mapped_column(String(50), index=True)
    status: Mapped[str] = mapped_column(String(30), default='created', index=True)
    trigger_source: Mapped[str] = mapped_column(String(20), default='api')
    input_json: Mapped[str] = mapped_column(Text, default='{}')
    output_json: Mapped[str] = mapped_column(Text, default='{}')
    error_log: Mapped[str] = mapped_column(Text, default='')
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    archived_by: Mapped[str] = mapped_column(String(64), default='')

    artifacts = relationship('TaskArtifactRecord', back_populates='task', cascade='all,delete-orphan')
