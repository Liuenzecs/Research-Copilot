from dataclasses import dataclass


@dataclass(slots=True)
class UserResearchProfile:
    interests: str
    preferred_methods: str
    focus_topics: str
