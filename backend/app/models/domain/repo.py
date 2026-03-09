from dataclasses import dataclass


@dataclass(slots=True)
class Repo:
    id: int
    repo_url: str
