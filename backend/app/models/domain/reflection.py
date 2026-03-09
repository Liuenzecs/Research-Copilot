from dataclasses import dataclass
from datetime import date, datetime


@dataclass(slots=True)
class Reflection:
    id: int
    reflection_type: str
    lifecycle_status: str
    report_summary: str
    event_date: date
    created_at: datetime
