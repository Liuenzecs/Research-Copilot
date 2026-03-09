from dataclasses import dataclass


@dataclass(slots=True)
class Note:
    id: int
    content: str
