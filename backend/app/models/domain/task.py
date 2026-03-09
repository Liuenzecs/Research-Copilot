from dataclasses import dataclass


@dataclass(slots=True)
class Task:
    id: int
    task_type: str
    status: str
