from dataclasses import dataclass
from datetime import datetime


@dataclass(slots=True)
class Paper:
    id: int
    title_en: str
    abstract_en: str
    source: str
    source_id: str
    pdf_url: str
    created_at: datetime
