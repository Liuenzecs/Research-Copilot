from dataclasses import dataclass


@dataclass(slots=True)
class Reproduction:
    id: int
    status: str
    plan_markdown: str
