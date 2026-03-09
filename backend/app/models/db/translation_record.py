from __future__ import annotations

from sqlalchemy import Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.db.base import Base, TimestampMixin


class TranslationRecord(TimestampMixin, Base):
    __tablename__ = 'translations'
    __table_args__ = (
        UniqueConstraint(
            'target_type',
            'target_id',
            'unit_type',
            'field_name',
            'locator_json',
            name='uq_translation_target_unit',
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    target_type: Mapped[str] = mapped_column(String(30), index=True)
    target_id: Mapped[int] = mapped_column(Integer, index=True)
    unit_type: Mapped[str] = mapped_column(String(30), index=True)
    field_name: Mapped[str] = mapped_column(String(50), default='')
    locator_json: Mapped[str] = mapped_column(Text, default='{}')
    content_en_snapshot: Mapped[str] = mapped_column(Text, default='')
    content_zh: Mapped[str] = mapped_column(Text)
    disclaimer: Mapped[str] = mapped_column(String(64), default='AI翻译，仅供辅助理解')
    provider: Mapped[str] = mapped_column(String(30), default='heuristic')
    model: Mapped[str] = mapped_column(String(100), default='local')
