from sqlalchemy import Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.db.base import Base, TimestampMixin


class ProfileRecord(TimestampMixin, Base):
    __tablename__ = 'profiles'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    interests: Mapped[str] = mapped_column(Text, default='')
    preferred_methods: Mapped[str] = mapped_column(Text, default='')
    focus_topics: Mapped[str] = mapped_column(Text, default='')
    research_goal: Mapped[str] = mapped_column(Text, default='')
