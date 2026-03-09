from dataclasses import dataclass


@dataclass(slots=True)
class Idea:
    id: int
    idea_type: str
    content: str
