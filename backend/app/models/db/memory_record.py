from __future__ import annotations

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.db.base import Base, TimestampMixin


class MemoryItemRecord(TimestampMixin, Base):
    __tablename__ = 'memory_items'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    memory_type: Mapped[str] = mapped_column(String(50), index=True)
    ref_table: Mapped[str] = mapped_column(String(50), default='')
    ref_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    layer: Mapped[str] = mapped_column(String(30), index=True)
    text_content: Mapped[str] = mapped_column(Text, default='')
    tags: Mapped[str] = mapped_column(Text, default='[]')
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    importance: Mapped[float] = mapped_column(Float, default=0.5)


class MemoryLinkRecord(TimestampMixin, Base):
    __tablename__ = 'memory_links'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    from_memory_id: Mapped[int] = mapped_column(ForeignKey('memory_items.id'), index=True)
    to_memory_id: Mapped[int] = mapped_column(ForeignKey('memory_items.id'), index=True)
    link_type: Mapped[str] = mapped_column(String(30), default='related')
    weight: Mapped[float] = mapped_column(Float, default=1.0)
