from dataclasses import dataclass


@dataclass(slots=True)
class Summary:
    id: int
    paper_id: int
    summary_type: str
    content_en: str
