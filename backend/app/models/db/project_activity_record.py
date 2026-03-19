from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.db.base import Base, TimestampMixin


class ProjectActivityEventRecord(TimestampMixin, Base):
    __tablename__ = 'project_activity_events'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey('research_projects.id'), index=True)
    event_type: Mapped[str] = mapped_column(String(50), index=True)
    title: Mapped[str] = mapped_column(String(255), default='')
    message: Mapped[str] = mapped_column(Text, default='')
    ref_type: Mapped[str] = mapped_column(String(50), default='', index=True)
    ref_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    metadata_json: Mapped[str] = mapped_column(Text, default='{}')
