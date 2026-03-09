from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(slots=True)
class SearchPaper:
    source: str
    source_id: str
    title_en: str
    abstract_en: str
    authors: str
    year: int | None
    venue: str
    pdf_url: str


class PaperSearchProvider(Protocol):
    async def search(self, query: str, limit: int = 10) -> list[SearchPaper]:
        raise NotImplementedError
