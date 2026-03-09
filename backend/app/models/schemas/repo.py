from datetime import datetime

from pydantic import BaseModel


class RepoFindRequest(BaseModel):
    paper_id: int | None = None
    query: str | None = None


class RepoOut(BaseModel):
    id: int
    paper_id: int | None = None
    platform: str
    repo_url: str
    owner: str
    name: str
    stars: int
    forks: int
    readme_summary: str
    created_at: datetime
    updated_at: datetime
