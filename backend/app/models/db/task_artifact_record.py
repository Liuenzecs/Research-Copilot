from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.db.base import Base, TimestampMixin


class TaskArtifactRecord(TimestampMixin, Base):
    __tablename__ = 'task_artifacts'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey('tasks.id'), index=True)
    artifact_type: Mapped[str] = mapped_column(String(50), index=True)
    artifact_ref_type: Mapped[str] = mapped_column(String(50), default='')
    artifact_ref_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    role: Mapped[str] = mapped_column(String(20), default='output')
    snapshot_json: Mapped[str] = mapped_column(Text, default='{}')

    task = relationship('TaskRecord', back_populates='artifacts')
