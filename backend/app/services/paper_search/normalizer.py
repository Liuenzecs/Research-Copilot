from __future__ import annotations

import math
import re
from dataclasses import dataclass, field

from app.models.schemas.paper import PaperSearchReasonOut
from app.services.paper_search.base import SearchPaper

_NON_WORD = re.compile(r'[^a-z0-9]+')
_MULTI_SPACE = re.compile(r'\s+')


@dataclass(slots=True)
class RankedSearchPaper:
    paper: SearchPaper
    rank_position: int
    rank_score: float
    reason: PaperSearchReasonOut = field(default_factory=PaperSearchReasonOut)


def _normalize(text: str) -> str:
    lowered = text.strip().lower()
    cleaned = _NON_WORD.sub(' ', lowered)
    return _MULTI_SPACE.sub(' ', cleaned).strip()


def _tokens(text: str) -> set[str]:
    normalized = _normalize(text)
    if not normalized:
        return set()
    return set(normalized.split(' '))


def _paper_key(paper: SearchPaper) -> str:
    if paper.doi:
        return f"doi:{paper.doi.strip().lower()}"
    if paper.openalex_id:
        return f"openalex:{paper.openalex_id.strip().lower()}"
    if paper.semantic_scholar_id:
        return f"semantic:{paper.semantic_scholar_id.strip().lower()}"
    title_key = _normalize(paper.title_en)
    if title_key:
        return f"title:{title_key}"
    return f"source:{paper.source}:{paper.source_id}"


def _pick_richer(primary: SearchPaper, candidate: SearchPaper) -> SearchPaper:
    def richness_score(paper: SearchPaper) -> tuple[int, int, int, int, int, int, int]:
        return (
            1 if paper.doi else 0,
            1 if paper.openalex_id else 0,
            1 if paper.semantic_scholar_id else 0,
            1 if paper.pdf_url else 0,
            len(paper.abstract_en or ''),
            paper.citation_count or 0,
            len(paper.authors or ''),
        )

    return candidate if richness_score(candidate) > richness_score(primary) else primary


def _merge_papers(items: list[SearchPaper]) -> tuple[SearchPaper, list[str], int]:
    merged = items[0]
    merged_sources = [items[0].source]
    for candidate in items[1:]:
        merged = _pick_richer(merged, candidate)
        if candidate.source not in merged_sources:
            merged_sources.append(candidate.source)
        merged = SearchPaper(
            source=merged.source,
            source_id=merged.source_id,
            title_en=merged.title_en or candidate.title_en,
            abstract_en=merged.abstract_en if len(merged.abstract_en or '') >= len(candidate.abstract_en or '') else candidate.abstract_en,
            authors=merged.authors or candidate.authors,
            year=max([value for value in [merged.year, candidate.year] if value is not None], default=None),
            venue=merged.venue or candidate.venue,
            pdf_url=merged.pdf_url or candidate.pdf_url,
            doi=merged.doi or candidate.doi,
            paper_url=merged.paper_url or candidate.paper_url,
            openalex_id=merged.openalex_id or candidate.openalex_id,
            semantic_scholar_id=merged.semantic_scholar_id or candidate.semantic_scholar_id,
            citation_count=max(merged.citation_count or 0, candidate.citation_count or 0),
            reference_count=max(merged.reference_count or 0, candidate.reference_count or 0),
        )
    return merged, merged_sources, len(items)


def _relevance_score(paper: SearchPaper, query_norm: str, query_tokens: set[str]) -> tuple[float, dict[str, float], list[str], list[str]]:
    title_norm = _normalize(paper.title_en)
    abstract_norm = _normalize(paper.abstract_en)
    if not title_norm:
        return -1.0, {}, [], []

    score_breakdown: dict[str, float] = {}
    matched_terms: list[str] = []
    matched_fields: list[str] = []

    if query_norm:
        if title_norm == query_norm:
            score_breakdown['title_exact'] = 1000.0
            matched_fields.append('title')
        elif query_norm in title_norm:
            score_breakdown['title_contains'] = 700.0
            matched_fields.append('title')

        title_tokens = _tokens(paper.title_en)
        if query_tokens:
            overlap_tokens = sorted(query_tokens & title_tokens)
            if overlap_tokens:
                score_breakdown['title_token_overlap'] = 300.0 * (len(overlap_tokens) / len(query_tokens))
                matched_terms.extend(overlap_tokens)
                if 'title' not in matched_fields:
                    matched_fields.append('title')

            abstract_overlap = sorted(query_tokens & _tokens(paper.abstract_en))
            if abstract_overlap:
                score_breakdown['abstract_token_overlap'] = 160.0 * (len(abstract_overlap) / len(query_tokens))
                matched_terms.extend([token for token in abstract_overlap if token not in matched_terms])
                if 'abstract' not in matched_fields:
                    matched_fields.append('abstract')

        if abstract_norm and query_norm in abstract_norm:
            score_breakdown['abstract_contains'] = 80.0
            if 'abstract' not in matched_fields:
                matched_fields.append('abstract')

    if paper.year:
        score_breakdown['year_bonus'] = min(max(paper.year - 1900, 0), 200) * 0.2
    if paper.citation_count:
        score_breakdown['citation_bonus'] = min(math.log10(max(paper.citation_count, 1) + 1), 3.0) * 6.0
    if paper.source == 'arxiv':
        score_breakdown['source_bonus'] = 5.0

    return sum(score_breakdown.values()), score_breakdown, matched_terms, matched_fields


def _build_reason(
    *,
    paper: SearchPaper,
    merged_sources: list[str],
    duplicate_count: int,
    matched_terms: list[str],
    matched_fields: list[str],
    score_breakdown: dict[str, float],
) -> PaperSearchReasonOut:
    source_signals = []
    if merged_sources:
        source_signals.append(f"来源：{' / '.join(merged_sources)}")
    if paper.year:
        source_signals.append(f'年份：{paper.year}')
    if paper.citation_count:
        source_signals.append(f'引用：{paper.citation_count}')
    if duplicate_count > 1:
        source_signals.append(f'已合并 {duplicate_count} 个重复候选')

    summary_parts: list[str] = []
    if matched_terms:
        summary_parts.append(f"命中关键词：{', '.join(matched_terms[:4])}")
    if matched_fields:
        summary_parts.append(f"命中位置：{' / '.join(matched_fields)}")
    if paper.year:
        summary_parts.append(f'年份 {paper.year}')
    if duplicate_count > 1:
        summary_parts.append('多来源合并')
    summary = '；'.join(summary_parts) if summary_parts else '与当前检索问题相关'

    return PaperSearchReasonOut(
        summary=summary,
        matched_terms=matched_terms,
        matched_fields=matched_fields,
        source_signals=source_signals,
        local_signals=[],
        merged_sources=merged_sources,
        duplicate_count=duplicate_count,
        score_breakdown=score_breakdown,
    )


def dedupe_and_rank(papers: list[SearchPaper], limit: int, query: str = '', sort_mode: str = 'relevance') -> list[RankedSearchPaper]:
    grouped: dict[str, list[SearchPaper]] = {}
    for paper in papers:
        key = _paper_key(paper)
        grouped.setdefault(key, []).append(paper)

    query_norm = _normalize(query)
    query_tokens = _tokens(query)

    ranked_entries: list[RankedSearchPaper] = []
    for group in grouped.values():
        merged, merged_sources, duplicate_count = _merge_papers(group)
        score, score_breakdown, matched_terms, matched_fields = _relevance_score(merged, query_norm, query_tokens)
        reason = _build_reason(
            paper=merged,
            merged_sources=merged_sources,
            duplicate_count=duplicate_count,
            matched_terms=matched_terms,
            matched_fields=matched_fields,
            score_breakdown=score_breakdown,
        )
        ranked_entries.append(
            RankedSearchPaper(
                paper=merged,
                rank_position=0,
                rank_score=score,
                reason=reason,
            )
        )

    if sort_mode == 'year_desc':
        ranked_entries.sort(key=lambda item: (item.paper.year or 0, item.rank_score, item.paper.citation_count or 0), reverse=True)
    elif sort_mode == 'citation_desc':
        ranked_entries.sort(key=lambda item: (item.paper.citation_count or 0, item.rank_score, item.paper.year or 0), reverse=True)
    else:
        ranked_entries.sort(key=lambda item: (item.rank_score, item.paper.year or 0, item.paper.citation_count or 0), reverse=True)

    limited = ranked_entries[:limit]
    for index, item in enumerate(limited, start=1):
        item.rank_position = index
    return limited
