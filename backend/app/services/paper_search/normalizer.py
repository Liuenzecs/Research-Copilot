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
    'about',
    'related',
    'research',
    'paper',
    'papers',
    'literature',
    'study',
    'studies',
)
_LOW_SIGNAL_QUERY_TOKENS = {
    'research',
    'paper',
    'papers',
    'literature',
    'study',
    'studies',
    'method',
    'methods',
    'approach',
    'approaches',
    'work',
    'works',
    'model',
    'models',
    'system',
    'systems',
    'based',
    'using',
    'about',
    'related',
}
_TOPIC_PROFILES: tuple[tuple[str, tuple[str, ...], tuple[str, ...]], ...] = (
    (
        'llm',
        (
            '大语言模型',
            '大模型',
            '基础模型',
            '语言模型',
            'large language model',
            'large language models',
            'llm',
            'llms',
            'foundation model',
            'foundation models',
            'language model',
            'language models',
        ),
        (
            'large language model',
            'large language models',
            'llm',
            'llms',
            'foundation model',
            'foundation models',
            'language model',
            'language models',
        ),
    ),
    (
        'agent',
        (
            '智能体',
            '多智能体',
            '代理',
            'agent',
            'agents',
            'ai agent',
            'ai agents',
            'multi agent',
            'multi-agent',
            'agentic',
            'autonomous agent',
            'autonomous agents',
        ),
        (
            'agent',
            'agents',
            'ai agent',
            'ai agents',
            'multi agent',
            'multi-agent',
            'agentic',
            'autonomous agent',
            'autonomous agents',
        ),
    ),
    (
        'rag',
        (
            '检索增强',
            '检索增强生成',
            'rag',
            'retrieval augmented generation',
            'retrieval-augmented generation',
            'retrieval augmented',
            'retrieval-augmented',
        ),
        (
            'rag',
            'retrieval augmented generation',
            'retrieval-augmented generation',
            'retrieval augmented',
            'retrieval-augmented',
        ),
    ),
    (
        'multimodal',
        (
            '多模态',
            '视觉语言',
            '视觉语言模型',
            'multimodal',
            'multi modal',
            'vision language model',
            'vision-language model',
            'vision language',
            'vlm',
        ),
        (
            'multimodal',
            'multi modal',
            'vision language model',
            'vision-language model',
            'vision language',
            'vlm',
        ),
    ),
    (
        'reasoning',
        (
            '推理',
            '思维链',
            'reasoning',
            'chain of thought',
            'chain-of-thought',
            'cot',
        ),
        (
            'reasoning',
            'chain of thought',
            'chain-of-thought',
            'cot',
        ),
    ),
    (
        'alignment',
        (
            '对齐',
            '偏好优化',
            'alignment',
            'preference optimization',
            'preference tuning',
            'rlhf',
            'dpo',
        ),
        (
            'alignment',
            'preference optimization',
            'preference tuning',
            'rlhf',
            'dpo',
        ),
    ),
    (
        'fine_tuning',
        (
            '微调',
            '指令微调',
            'fine tuning',
            'fine-tuning',
            'instruction tuning',
            'sft',
        ),
        (
            'fine tuning',
            'fine-tuning',
            'instruction tuning',
            'sft',
        ),
    ),
)


@dataclass(slots=True)
class QueryProfile:
    provider_queries: list[str]
    normalized_queries: list[str]
    query_tokens: set[str]
    topic_phrases: list[str]
    matched_topic_keys: list[str]
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


def _topic_matches(query: str) -> list[tuple[str, tuple[str, ...]]]:
    lookup_space = _normalize(f'{query} {_strip_query_fillers(query)}')
    matched: list[tuple[str, tuple[str, ...]]] = []
    for topic_key, aliases, expansions in _TOPIC_PROFILES:
        normalized_aliases = [_normalize(alias) for alias in aliases]
        if any(alias and alias in lookup_space for alias in normalized_aliases):
            matched.append((topic_key, expansions))
    return matched


def _query_tokens(query_variants: list[str]) -> set[str]:
    tokens: set[str] = set()
    for variant in query_variants:
        for token in _tokens(variant):
            if _contains_cjk(token):
                tokens.add(token)
                continue
            if len(token) < 2 or token in _LOW_SIGNAL_QUERY_TOKENS:
                continue
            tokens.add(token)
    return tokens


def build_provider_queries(query: str) -> list[str]:
    raw_query = _MULTI_SPACE.sub(' ', query.strip()).strip()
    if not raw_query:
        return []

    provider_queries = [raw_query]
    cleaned_query = _strip_query_fillers(raw_query)
    if cleaned_query and cleaned_query != raw_query.lower():
        provider_queries.append(cleaned_query)

    expansion_terms: list[str] = []
    for _topic_key, expansions in _topic_matches(raw_query):
        expansion_terms.extend(expansions)

    expansion_terms = _dedupe_texts(expansion_terms)
    if expansion_terms:
        provider_queries.append(' '.join(expansion_terms[:10]))

    return _dedupe_texts(provider_queries)


def build_query_profile(query: str) -> QueryProfile:
    provider_queries = build_provider_queries(query)
    normalized_queries = _dedupe_texts([_normalize(value) for value in provider_queries if _normalize(value)])
    topic_matches = _topic_matches(query)
    topic_phrases = _dedupe_texts([phrase for _topic_key, phrases in topic_matches for phrase in phrases])
    query_tokens = _query_tokens(provider_queries)

    return QueryProfile(
        provider_queries=provider_queries,
        normalized_queries=normalized_queries,
        query_tokens=query_tokens,
        topic_phrases=topic_phrases,
        matched_topic_keys=[topic_key for topic_key, _phrases in topic_matches],
        has_signal=bool(normalized_queries or query_tokens or topic_phrases),
        requires_strict_match=bool(topic_matches or topic_phrases),
    )


def _paper_key(paper: SearchPaper) -> str:
    if paper.doi:
        return f'doi:{paper.doi.strip().lower()}'
    if paper.openalex_id:
        return f'openalex:{paper.openalex_id.strip().lower()}'
    if paper.semantic_scholar_id:
        return f'semantic:{paper.semantic_scholar_id.strip().lower()}'
    title_key = _normalize(paper.title_en)
    if title_key:
        return f'title:{title_key}'
    return f'source:{paper.source}:{paper.source_id}'


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


def _phrase_hits(text: str, phrases: list[str]) -> list[str]:
    normalized_text = _normalize(text)
    return [phrase for phrase in phrases if phrase and phrase in normalized_text]


def _relevance_score(
    paper: SearchPaper,
    query_profile: QueryProfile,
) -> tuple[float, dict[str, float], list[str], list[str], bool, float, bool, str, str]:
    title_norm = _normalize(paper.title_en)
    abstract_norm = _normalize(paper.abstract_en)
    if not title_norm:
        return -1.0, {}, [], [], False, 0.0, False, 'missing_title', '标题为空，无法判断主题相关性'

    title_tokens = _tokens(paper.title_en)
    abstract_tokens = _tokens(paper.abstract_en)
    matched_terms: list[str] = []
    matched_fields: list[str] = []
    score_breakdown: dict[str, float] = {}

    def append_match(term: str, field: str) -> None:
        if term and term not in matched_terms:
            matched_terms.append(term)
        if field not in matched_fields:
            matched_fields.append(field)

    title_exact_match = next((value for value in query_profile.normalized_queries if value and title_norm == value), '')
    title_phrase_match = next((value for value in query_profile.normalized_queries if value and value in title_norm), '')
    abstract_phrase_match = next((value for value in query_profile.normalized_queries if value and value in abstract_norm), '')

    topic_title_hits = _phrase_hits(paper.title_en, query_profile.topic_phrases)
    topic_abstract_hits = _phrase_hits(paper.abstract_en, query_profile.topic_phrases)
    title_token_overlap = sorted(query_profile.query_tokens & title_tokens)
    abstract_token_overlap = sorted(query_profile.query_tokens & abstract_tokens)

    topic_match_score = 0.0
    if title_exact_match:
        topic_match_score += 100.0
        score_breakdown['title_exact'] = 100.0
        append_match(title_exact_match, 'title')
    elif title_phrase_match:
        topic_match_score += 78.0
        score_breakdown['title_phrase'] = 78.0
        append_match(title_phrase_match, 'title')

    if topic_title_hits:
        topic_match_score += 55.0
        score_breakdown['topic_title_phrase'] = 55.0
        for hit in topic_title_hits[:4]:
            append_match(hit, 'title')

    if title_token_overlap and query_profile.query_tokens:
        overlap_score = 26.0 * (len(title_token_overlap) / len(query_profile.query_tokens))
        topic_match_score += overlap_score
        score_breakdown['title_token_overlap'] = overlap_score
        for hit in title_token_overlap[:4]:
            append_match(hit, 'title')

    if abstract_phrase_match:
        topic_match_score += 28.0
        score_breakdown['abstract_phrase'] = 28.0
        append_match(abstract_phrase_match, 'abstract')

    if topic_abstract_hits:
        topic_match_score += 20.0
        score_breakdown['topic_abstract_phrase'] = 20.0
        for hit in topic_abstract_hits[:4]:
            append_match(hit, 'abstract')

    if abstract_token_overlap and query_profile.query_tokens:
        overlap_score = 12.0 * (len(abstract_token_overlap) / len(query_profile.query_tokens))
        topic_match_score += overlap_score
        score_breakdown['abstract_token_overlap'] = overlap_score
        for hit in abstract_token_overlap[:4]:
            append_match(hit, 'abstract')

    passed_topic_gate = (not query_profile.requires_strict_match) or topic_match_score > 0
    lexical_match = bool(matched_terms or matched_fields)

    if paper.year:
        year_bonus = min(max(paper.year - 1990, 0), 60) * 0.35
        score_breakdown['year_bonus'] = year_bonus
    if paper.citation_count:
        citation_bonus = min(math.log10(max(paper.citation_count, 1) + 1), 4.0) * 4.0
        score_breakdown['citation_bonus'] = citation_bonus
    if paper.pdf_url:
        score_breakdown['pdf_bonus'] = 3.0

    rank_score = topic_match_score + sum(value for key, value in score_breakdown.items() if key != 'topic_match_score')
    score_breakdown['topic_match_score'] = topic_match_score

    if not passed_topic_gate:
        score_breakdown['off_topic_penalty'] = -1000.0
        rank_score -= 1000.0

    filter_reason = 'passed_topic_gate' if passed_topic_gate else 'off_topic'

    ranking_parts: list[str] = []
    if title_exact_match or title_phrase_match or topic_title_hits:
        ranking_parts.append('标题命中主题')
    if abstract_phrase_match or topic_abstract_hits or abstract_token_overlap:
        ranking_parts.append('摘要补充相关性')
    if paper.pdf_url:
        ranking_parts.append('可直接获取 PDF')
    if paper.year:
        ranking_parts.append(f'年份 {paper.year}')
    if paper.citation_count:
        ranking_parts.append(f'引用 {paper.citation_count}')
    if not ranking_parts:
        ranking_parts.append('主要依赖基础元数据排序')

    return (
        rank_score,
        score_breakdown,
        matched_terms,
        matched_fields,
        lexical_match,
        topic_match_score,
        passed_topic_gate,
        filter_reason,
        '；'.join(ranking_parts),
    )


def _build_reason(
    *,
    paper: SearchPaper,
    merged_sources: list[str],
    duplicate_count: int,
    matched_terms: list[str],
    matched_fields: list[str],
    score_breakdown: dict[str, float],
    topic_match_score: float,
    passed_topic_gate: bool,
    filter_reason: str,
    ranking_reason: str,
) -> PaperSearchReasonOut:
    source_signals: list[str] = []
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
        summary_parts.append(f"命中主题词：{', '.join(matched_terms[:4])}")
    if matched_fields:
        summary_parts.append(f"命中位置：{' / '.join(matched_fields)}")
    summary_parts.append(f"主题匹配分 {topic_match_score:.1f}")
    summary_parts.append('通过主题门槛' if passed_topic_gate else '未通过主题门槛')
    summary_parts.append(ranking_reason)

    return PaperSearchReasonOut(
        summary='；'.join(part for part in summary_parts if part),
        matched_terms=matched_terms,
        matched_fields=matched_fields,
        source_signals=source_signals,
        local_signals=[],
        merged_sources=merged_sources,
        duplicate_count=duplicate_count,
        score_breakdown=score_breakdown,
        topic_match_score=topic_match_score,
        passed_topic_gate=passed_topic_gate,
        filter_reason=filter_reason,
        ranking_reason=ranking_reason,
    )


def dedupe_and_rank(papers: list[SearchPaper], limit: int, query: str = '', sort_mode: str = 'relevance') -> list[RankedSearchPaper]:
    grouped: dict[str, list[SearchPaper]] = {}
    for paper in papers:
        key = _paper_key(paper)
        grouped.setdefault(key, []).append(paper)

    query_profile = build_query_profile(query)
    ranked_entries: list[RankedSearchPaper] = []
    for group in grouped.values():
        merged, merged_sources, duplicate_count = _merge_papers(group)
        (
            score,
            score_breakdown,
            matched_terms,
            matched_fields,
            lexical_match,
            topic_match_score,
            passed_topic_gate,
            filter_reason,
            ranking_reason,
        ) = _relevance_score(merged, query_profile)
        if query_profile.requires_strict_match and not passed_topic_gate:
            continue

        reason = _build_reason(
            paper=merged,
            merged_sources=merged_sources,
            duplicate_count=duplicate_count,
            matched_terms=matched_terms,
            matched_fields=matched_fields,
            score_breakdown=score_breakdown,
            topic_match_score=topic_match_score,
            passed_topic_gate=passed_topic_gate,
            filter_reason=filter_reason,
            ranking_reason=ranking_reason,
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
        ranked_entries.sort(
            key=lambda item: (
                item.paper.year or 0,
                item.reason.topic_match_score,
                item.rank_score,
                item.paper.citation_count or 0,
            ),
            reverse=True,
        )
    elif sort_mode == 'citation_desc':
        ranked_entries.sort(
            key=lambda item: (
                item.paper.citation_count or 0,
                item.reason.topic_match_score,
                item.rank_score,
                item.paper.year or 0,
            ),
            reverse=True,
        )
    else:
        ranked_entries.sort(
            key=lambda item: (
                item.reason.topic_match_score,
                item.rank_score,
                item.paper.year or 0,
                item.paper.citation_count or 0,
            ),
            reverse=True,
        )

    limited = ranked_entries[:limit]
    for index, item in enumerate(limited, start=1):
        item.rank_position = index
    return limited
