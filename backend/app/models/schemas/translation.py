from pydantic import BaseModel


class KeyFieldTranslationRequest(BaseModel):
    target_type: str
    target_id: int
    fields: list[str]


class SegmentTranslationRequest(BaseModel):
    text: str
    mode: str = 'paragraph'
    locator: dict | None = None


class TranslationOut(BaseModel):
    id: int
    target_type: str
    target_id: int
    unit_type: str
    field_name: str
    content_en_snapshot: str
    content_zh: str
    disclaimer: str
