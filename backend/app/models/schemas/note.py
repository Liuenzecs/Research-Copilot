from pydantic import BaseModel


class NoteOut(BaseModel):
    id: int
    content: str
