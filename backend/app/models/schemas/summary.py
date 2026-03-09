from datetime import datetime

from pydantic import BaseModel


class SummaryGenerateRequest(BaseModel):
    paper_id: int
    focus: str | None = None


class SummaryCompareRequest(BaseModel):
    paper_ids: list[int]


class SummaryOut(BaseModel):
    id: int
    paper_id: int
    summary_type: str
    content_en: str
    problem_en: str = ''
    method_en: str = ''
    contributions_en: str = ''
    limitations_en: str = ''
    future_work_en: str = ''
    provider: str = ''
    model: str = ''
    created_at: datetime
    updated_at: datetime


class SummaryCompareResponse(BaseModel):
    comparison_markdown: str
