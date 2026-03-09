from datetime import datetime

from pydantic import BaseModel


class MessageResponse(BaseModel):
    message: str


class IdResponse(BaseModel):
    id: int


class Timestamped(BaseModel):
    created_at: datetime
    updated_at: datetime
