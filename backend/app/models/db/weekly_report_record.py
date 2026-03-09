from __future__ import annotations

from datetime import date

from sqlalchemy import Date, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.db.base import Base, TimestampMixin


class WeeklyReportRecord(TimestampMixin, Base):
    __tablename__ = 'weekly_reports'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    week_start: Mapped[date] = mapped_column(Date, index=True)
    week_end: Mapped[date] = mapped_column(Date, index=True)
    title: Mapped[str] = mapped_column(String(255), default='周报草稿')
    draft_markdown: Mapped[str] = mapped_column(Text, default='')
    status: Mapped[str] = mapped_column(String(20), default='draft', index=True)
    source_snapshot_json: Mapped[str] = mapped_column(Text, default='{}')
    generated_task_id: Mapped[int | None] = mapped_column(ForeignKey('tasks.id'), nullable=True, index=True)
