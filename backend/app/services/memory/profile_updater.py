from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.db.profile_record import ProfileRecord


class ProfileUpdater:
    def ensure_profile(self, db: Session) -> ProfileRecord:
        profile = db.get(ProfileRecord, 1)
        if profile is None:
            profile = ProfileRecord(id=1)
            db.add(profile)
            db.commit()
            db.refresh(profile)
        return profile

    def update_focus_topics(self, db: Session, topic: str) -> ProfileRecord:
        profile = self.ensure_profile(db)
        existing = [x.strip() for x in profile.focus_topics.split(',') if x.strip()]
        if topic and topic not in existing:
            existing.append(topic)
            profile.focus_topics = ', '.join(existing[:30])
            db.add(profile)
            db.commit()
            db.refresh(profile)
        return profile


profile_updater = ProfileUpdater()
