from __future__ import annotations

from collections import OrderedDict

from app.services.paper_search.base import SearchPaper


def dedupe_and_rank(papers: list[SearchPaper], limit: int) -> list[SearchPaper]:
    # Keep first occurrence by normalized title.
    by_title: OrderedDict[str, SearchPaper] = OrderedDict()
    for paper in papers:
        key = paper.title_en.strip().lower()
        if not key:
            continue
        if key not in by_title:
            by_title[key] = paper
    ranked = list(by_title.values())
    ranked.sort(key=lambda p: (p.year or 0), reverse=True)
    return ranked[:limit]
