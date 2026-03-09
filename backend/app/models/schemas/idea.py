from pydantic import BaseModel, Field


class BrainstormRequest(BaseModel):
    topic: str
    paper_ids: list[int] = Field(default_factory=list)


class IdeaOut(BaseModel):
    id: int
    idea_type: str
    content: str
