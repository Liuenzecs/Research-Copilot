from __future__ import annotations

import re
from collections import OrderedDict

from app.services.paper_search.base import SearchPaper

_NON_WORD = re.compile(r'[^a-z0-9]+')
_MULTI_SPACE = re.compile(r'\s+')


def _normalize(text: str) -> str:
    lowered = text.strip().lower()
    cleaned = _NON_WORD.sub(' ', lowered)
    return _MULTI_SPACE.sub(' ', cleaned).strip()


def _tokens(text: str) -> set[str]:
    normalized = _normalize(text)
    if not normalized:
        return set()
    return set(normalized.split(' '))


def _relevance_score(paper: SearchPaper, query_norm: str, query_tokens: set[str]) -> float:
    title_norm = _normalize(paper.title_en)
    if not title_norm:
        return -1.0

    score = 0.0

    if query_norm:
        if title_norm == query_norm:
            score += 1000.0
        if query_norm in title_norm:
            score += 700.0

        title_tokens = _tokens(paper.title_en)
        if query_tokens:
            overlap = len(query_tokens & title_tokens)
            score += 300.0 * (overlap / len(query_tokens))

        abstract_norm = _normalize(paper.abstract_en)
        if abstract_norm and query_norm in abstract_norm:
            score += 80.0

    # Keep recency as tie-breaker, not primary ranking factor.
    if paper.year:
        score += min(max(paper.year - 1900, 0), 200) * 0.2

    if paper.source == 'arxiv':
        score += 5.0

    return score


def dedupe_and_rank(papers: list[SearchPaper], limit: int, query: str = '') -> list[SearchPaper]:
    by_title: OrderedDict[str, SearchPaper] = OrderedDict()
    for paper in papers:
        key = _normalize(paper.title_en)
        if not key:
            continue
        if key not in by_title:
            by_title[key] = paper

    ranked = list(by_title.values())
    query_norm = _normalize(query)
    query_tokens = _tokens(query)

    ranked.sort(
        key=lambda p: (
            _relevance_score(p, query_norm, query_tokens),
            p.year or 0,
        ),
        reverse=True,
    )
    return ranked[:limit]
