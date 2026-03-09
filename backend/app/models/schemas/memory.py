from datetime import datetime

from pydantic import BaseModel, Field


class MemoryQueryRequest(BaseModel):
    query: str
    memory_types: list[str] = Field(default_factory=list)
    layers: list[str] = Field(default_factory=list)
    top_k: int = 10


class MemoryOut(BaseModel):
    id: int
    memory_type: str
    layer: str
    text_content: str
    importance: float
    pinned: bool
    archived: bool
    created_at: datetime
    updated_at: datetime


class MemoryLinkRequest(BaseModel):
    from_memory_id: int
    to_memory_id: int
    link_type: str = 'related'
    weight: float = 1.0


class MemoryArchiveRequest(BaseModel):
    memory_id: int
    archived: bool = True
