from __future__ import annotations

import math
import re
from dataclasses import dataclass, field

from app.models.schemas.paper import PaperSearchReasonOut
from app.services.paper_search.base import SearchPaper

_CJK_RE = re.compile(r'[\u3400-\u4dbf\u4e00-\u9fff]')
_TOKEN_RE = re.compile(r'[a-z0-9]+|[\u3400-\u4dbf\u4e00-\u9fff]+')
_MULTI_SPACE = re.compile(r'\s+')
_QUERY_FILLERS = (
    '相关研究',
    '相关的',
    '相关',
    '有关',
    '方向',
    '领域',
    '方面',
    '研究问题',
    '研究',
    '论文',
    '文献',
    '工作',
    '方法',
    '主题',
    '内容',
    '一些',
    '哪些',
    '帮我',
    '请',
)
_QUERY_EXPANSIONS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ('large language model', ('large language model', 'llm', 'foundation model')),
    ('llm', ('large language model', 'llm', 'foundation model')),
    ('大语言模型', ('large language model', 'llm', 'foundation model')),
    ('大模型', ('large language model', 'llm', 'foundation model')),
    ('基础模型', ('foundation model', 'large language model')),
    ('语言模型', ('language model', 'llm')),
    ('多模态', ('multimodal', 'vision language model', 'vlm')),
    ('视觉语言', ('vision language model', 'vlm', 'multimodal')),
    ('检索增强', ('retrieval augmented generation', 'rag')),
    ('rag', ('retrieval augmented generation', 'rag')),
    ('智能体', ('agent', 'ai agent')),
    ('推理', ('reasoning', 'inference')),
    ('对齐', ('alignment', 'preference optimization')),
    ('微调', ('fine tuning', 'instruction tuning')),
    ('强化学习', ('reinforcement learning', 'rl')),
    ('扩散', ('diffusion model', 'diffusion')),
)


@dataclass(slots=True)
class QueryProfile:
    provider_queries: list[str]
    normalized_queries: list[str]
    query_tokens: set[str]
    has_signal: bool
    requires_strict_match: bool


@dataclass(slots=True)
class RankedSearchPaper:
    paper: SearchPaper
    rank_position: int
    rank_score: float
    reason: PaperSearchReasonOut = field(default_factory=PaperSearchReasonOut)


def _normalize(text: str) -> str:
    lowered = text.strip().lower()
    parts = _TOKEN_RE.findall(lowered)
    return _MULTI_SPACE.sub(' ', ' '.join(parts)).strip()


def _contains_cjk(text: str) -> bool:
    return bool(_CJK_RE.search(text))


def _cjk_tokens(block: str) -> set[str]:
    cleaned = block.strip()
    if not cleaned:
        return set()

    tokens = {cleaned}
    if len(cleaned) >= 2:
        tokens.update(cleaned[index : index + 2] for index in range(len(cleaned) - 1))
    if len(cleaned) >= 3:
        tokens.update(cleaned[index : index + 3] for index in range(len(cleaned) - 2))
    return tokens


def _tokens(text: str) -> set[str]:
    normalized = _normalize(text)
    if not normalized:
        return set()
    tokens: set[str] = set()
    for part in normalized.split(' '):
        if _contains_cjk(part):
            tokens.update(_cjk_tokens(part))
        else:
            tokens.add(part)
    return tokens


def _dedupe_texts(items: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for item in items:
        normalized = _MULTI_SPACE.sub(' ', item.strip().lower()).strip()
        if normalized and normalized not in seen:
            seen.add(normalized)
            ordered.append(normalized)
    return ordered


def _strip_query_fillers(query: str) -> str:
    cleaned = query.strip().lower()
    for filler in _QUERY_FILLERS:
        cleaned = cleaned.replace(filler, ' ')
    return _MULTI_SPACE.sub(' ', cleaned).strip()


def build_provider_queries(query: str) -> list[str]:
    raw_query = _MULTI_SPACE.sub(' ', query.strip()).strip()
    if not raw_query:
        return []

    provider_queries = [raw_query]
    cleaned_query = _strip_query_fillers(raw_query)
    if cleaned_query and cleaned_query != raw_query.lower():
        provider_queries.append(cleaned_query)

    expansion_terms: list[str] = []
    lookup_space = f'{raw_query.lower()} {cleaned_query}'.strip()
    for needle, expansions in _QUERY_EXPANSIONS:
        if needle in lookup_space:
            expansion_terms.extend(expansions)

    expansion_terms = _dedupe_texts(expansion_terms)
    if expansion_terms:
        provider_queries.append(' '.join(expansion_terms[:8]))

    return _dedupe_texts(provider_queries)


def build_query_profile(query: str) -> QueryProfile:
    raw_query = query.strip()
    provider_queries = build_provider_queries(query)
    normalized_queries: list[str] = []
    query_tokens: set[str] = set()

    for variant in provider_queries:
        normalized = _normalize(variant)
        if normalized and normalized not in normalized_queries:
            normalized_queries.append(normalized)
        query_tokens.update(_tokens(variant))

    return QueryProfile(
        provider_queries=provider_queries,
        normalized_queries=normalized_queries,
        query_tokens=query_tokens,
        has_signal=bool(normalized_queries or query_tokens),
        requires_strict_match=_contains_cjk(raw_query),
    )


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


def _relevance_score(
    paper: SearchPaper,
    query_profile: QueryProfile,
) -> tuple[float, dict[str, float], list[str], list[str], bool]:
    title_norm = _normalize(paper.title_en)
    abstract_norm = _normalize(paper.abstract_en)
    if not title_norm:
        return -1.0, {}, [], [], False

    score_breakdown: dict[str, float] = {}
    matched_terms: list[str] = []
    matched_fields: list[str] = []
    title_tokens = _tokens(paper.title_en)
    abstract_tokens = _tokens(paper.abstract_en)

    title_exact_match = next((value for value in query_profile.normalized_queries if value and title_norm == value), '')
    title_phrase_match = next((value for value in query_profile.normalized_queries if value and value in title_norm), '')
    abstract_phrase_match = next((value for value in query_profile.normalized_queries if value and value in abstract_norm), '')

    if title_exact_match:
        score_breakdown['title_exact'] = 1000.0
        matched_terms.append(title_exact_match)
        matched_fields.append('title')
    elif title_phrase_match:
        score_breakdown['title_contains'] = 700.0
        matched_terms.append(title_phrase_match)
        matched_fields.append('title')

    if query_profile.query_tokens:
        overlap_tokens = sorted(query_profile.query_tokens & title_tokens)
        if overlap_tokens:
            score_breakdown['title_token_overlap'] = 300.0 * (len(overlap_tokens) / len(query_profile.query_tokens))
            matched_terms.extend([token for token in overlap_tokens if token not in matched_terms])
            if 'title' not in matched_fields:
                matched_fields.append('title')

        abstract_overlap = sorted(query_profile.query_tokens & abstract_tokens)
        if abstract_overlap:
            score_breakdown['abstract_token_overlap'] = 160.0 * (len(abstract_overlap) / len(query_profile.query_tokens))
            matched_terms.extend([token for token in abstract_overlap if token not in matched_terms])
            if 'abstract' not in matched_fields:
                matched_fields.append('abstract')

    if abstract_phrase_match:
        score_breakdown['abstract_contains'] = 80.0
        if abstract_phrase_match not in matched_terms:
            matched_terms.append(abstract_phrase_match)
        if 'abstract' not in matched_fields:
            matched_fields.append('abstract')

    lexical_match = bool(matched_terms or matched_fields)

    if paper.year:
        score_breakdown['year_bonus'] = min(max(paper.year - 1900, 0), 200) * 0.2
    if paper.citation_count:
        score_breakdown['citation_bonus'] = min(math.log10(max(paper.citation_count, 1) + 1), 3.0) * 6.0
    if paper.source == 'arxiv':
        score_breakdown['source_bonus'] = 5.0

    if query_profile.has_signal and not lexical_match:
        score_breakdown['no_match_penalty'] = -240.0

    return sum(score_breakdown.values()), score_breakdown, matched_terms, matched_fields, lexical_match


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

    query_profile = build_query_profile(query)

    ranked_entries_with_match: list[tuple[RankedSearchPaper, bool]] = []
    for group in grouped.values():
        merged, merged_sources, duplicate_count = _merge_papers(group)
        score, score_breakdown, matched_terms, matched_fields, lexical_match = _relevance_score(merged, query_profile)
        reason = _build_reason(
            paper=merged,
            merged_sources=merged_sources,
            duplicate_count=duplicate_count,
            matched_terms=matched_terms,
            matched_fields=matched_fields,
            score_breakdown=score_breakdown,
        )
        ranked_entries_with_match.append(
            (
                RankedSearchPaper(
                    paper=merged,
                    rank_position=0,
                    rank_score=score,
                    reason=reason,
                ),
                lexical_match,
            )
        )

    if query_profile.requires_strict_match and any(is_match for _, is_match in ranked_entries_with_match):
        ranked_entries = [entry for entry, is_match in ranked_entries_with_match if is_match]
    else:
        ranked_entries = [entry for entry, _ in ranked_entries_with_match]

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
