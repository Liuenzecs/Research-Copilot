from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.db.base import Base, TimestampMixin


class RepoRecord(TimestampMixin, Base):
    __tablename__ = 'repos'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    paper_id: Mapped[int | None] = mapped_column(ForeignKey('papers.id'), nullable=True, index=True)
    platform: Mapped[str] = mapped_column(String(30), default='github')
    repo_url: Mapped[str] = mapped_column(Text)
    owner: Mapped[str] = mapped_column(String(255), default='')
    name: Mapped[str] = mapped_column(String(255), default='')
    stars: Mapped[int] = mapped_column(Integer, default=0)
    forks: Mapped[int] = mapped_column(Integer, default=0)
    readme_summary: Mapped[str] = mapped_column(Text, default='')

    paper = relationship('PaperRecord', back_populates='repos')
    reflections = relationship('ReflectionRecord', back_populates='repo')
    reproductions = relationship('ReproductionRecord', back_populates='repo')
