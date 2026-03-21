from __future__ import annotations

import math
import re
from dataclasses import dataclass, field

from app.models.schemas.paper import PaperSearchReasonOut
from app.services.paper_search.classic_seeds import match_classic_seed
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
_PRIMARY_TOPIC_KEYS = {'llm', 'agent', 'rag', 'multimodal'}
_DOMAIN_APPLICATION_TERMS = {
    'biomedical',
    'clinical',
    'clinic',
    'medical',
    'medicine',
    'health',
    'healthcare',
    'diagnostics',
    'disease',
    'drug',
    'sickle',
    'cell',
    'finance',
    'financial',
    'cybersecurity',
    'security',
    'hardware',
    'circuit',
    'materials',
    'geoscience',
    'water',
    'urban',
    'power',
    'video',
    'multimedia',
    'german',
    'arabic',
    'taiwan',
    'sovereignty',
    'openfoam',
    'fluid',
    'dynamics',
}
_GENERIC_TECHNICAL_TERMS = {
    'survey',
    'review',
    'benchmark',
    'evaluation',
    'framework',
    'method',
    'methods',
    'reasoning',
    'planning',
    'tool',
    'agent',
    'agents',
    'agentic',
    'retrieval',
    'prompt',
    'alignment',
    'multiagent',
    'multi',
    'open',
    'source',
    'reproducibility',
    'code',
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
        'tool_use',
        (
            '工具使用',
            '工具调用',
            'tool use',
            'tool-use',
            'tool calling',
            'function calling',
            'function call',
            'api calling',
        ),
        (
            'tool use',
            'tool calling',
            'function calling',
            'api calling',
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
    required_topic_keys: list[str]
    generic_technical_query: bool
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


def _term_in_context(term: str, normalized_text: str, token_set: set[str]) -> bool:
    normalized_term = _normalize(term)
    if not normalized_term:
        return False
    if ' ' in normalized_term or _contains_cjk(normalized_term):
        return normalized_term in normalized_text
    return normalized_term in token_set


def _query_domain_terms(query_tokens: set[str]) -> set[str]:
    return {token for token in query_tokens if token in _DOMAIN_APPLICATION_TERMS}


def _required_topic_keys(matched_topic_keys: list[str]) -> list[str]:
    matched = [topic for topic in matched_topic_keys if topic]
    primary = [topic for topic in matched if topic in _PRIMARY_TOPIC_KEYS]
    if primary:
        return primary
    return matched


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
    matched_topic_keys = [topic_key for topic_key, _phrases in topic_matches]
    required_topic_keys = _required_topic_keys(matched_topic_keys)
    generic_technical_query = bool(matched_topic_keys) and not _query_domain_terms(query_tokens)

    return QueryProfile(
        provider_queries=provider_queries,
        normalized_queries=normalized_queries,
        query_tokens=query_tokens,
        topic_phrases=topic_phrases,
        matched_topic_keys=matched_topic_keys,
        required_topic_keys=required_topic_keys,
        generic_technical_query=generic_technical_query,
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


def _matched_topic_families(
    title_norm: str,
    abstract_norm: str,
    title_tokens: set[str],
    abstract_tokens: set[str],
    query_profile: QueryProfile,
) -> tuple[set[str], set[str], set[str]]:
    matched: set[str] = set()
    title_hits: set[str] = set()
    abstract_hits: set[str] = set()

    for topic_key, aliases, expansions in _TOPIC_PROFILES:
        if topic_key not in query_profile.matched_topic_keys:
            continue

        title_match = any(
            _term_in_context(term, title_norm, title_tokens)
            for term in [*aliases, *expansions]
        )
        abstract_match = any(
            _term_in_context(term, abstract_norm, abstract_tokens)
            for term in [*aliases, *expansions]
        )

        if title_match or abstract_match:
            matched.add(topic_key)
        if title_match:
            title_hits.add(topic_key)
        if abstract_match:
            abstract_hits.add(topic_key)

    return matched, title_hits, abstract_hits


def _scope_penalty(
    title_tokens: set[str],
    abstract_tokens: set[str],
    query_profile: QueryProfile,
    *,
    is_classic_seed: bool,
) -> tuple[float, list[str]]:
    if not query_profile.generic_technical_query or is_classic_seed:
        return 0.0, []

    paper_tokens = title_tokens | abstract_tokens
    domain_hits = sorted(paper_tokens & _DOMAIN_APPLICATION_TERMS)
    technical_hits = sorted(paper_tokens & _GENERIC_TECHNICAL_TERMS)
    if not domain_hits:
        return 0.0, []

    if len(technical_hits) >= 3:
        return 0.0, []

    penalty = min(24.0, 8.0 + (len(domain_hits) - 1) * 4.0)
    return penalty, domain_hits[:3]


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
    matched_topic_families, title_topic_families, abstract_topic_families = _matched_topic_families(
        title_norm,
        abstract_norm,
        title_tokens,
        abstract_tokens,
        query_profile,
    )
    matched_required_topics = set(query_profile.required_topic_keys) & matched_topic_families
    classic_seed = match_classic_seed(paper.title_en)
    classic_seed_hit = bool(
        classic_seed and (set(classic_seed.topics) & set(query_profile.matched_topic_keys or query_profile.required_topic_keys))
    )

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

    if title_topic_families:
        family_title_bonus = 18.0 * len(title_topic_families)
        topic_match_score += family_title_bonus
        score_breakdown['topic_family_title_bonus'] = family_title_bonus
        for topic_key in sorted(title_topic_families):
            append_match(topic_key, 'title')

    if abstract_topic_families:
        family_abstract_bonus = 8.0 * len(abstract_topic_families)
        topic_match_score += family_abstract_bonus
        score_breakdown['topic_family_abstract_bonus'] = family_abstract_bonus
        for topic_key in sorted(abstract_topic_families):
            append_match(topic_key, 'abstract')

    if query_profile.required_topic_keys:
        coverage_bonus = 30.0 * (len(matched_required_topics) / len(query_profile.required_topic_keys))
        if coverage_bonus:
            topic_match_score += coverage_bonus
            score_breakdown['required_topic_coverage_bonus'] = coverage_bonus

    if classic_seed_hit and classic_seed is not None:
        topic_match_score += 66.0
        score_breakdown['classic_seed_bonus'] = 66.0
        append_match(classic_seed.canonical_title, 'title')

    missing_topics = [topic for topic in query_profile.required_topic_keys if topic not in matched_topic_families]
    passed_topic_gate = True
    if query_profile.requires_strict_match and query_profile.required_topic_keys:
        passed_topic_gate = not missing_topics or classic_seed_hit
    elif query_profile.requires_strict_match:
        passed_topic_gate = topic_match_score > 0

    lexical_match = bool(matched_terms or matched_fields)

    if paper.year:
        year_bonus = min(max(paper.year - 1990, 0), 60) * 0.35
        score_breakdown['year_bonus'] = year_bonus
    if paper.citation_count:
        citation_bonus = min(math.log10(max(paper.citation_count, 1) + 1), 4.0) * 4.0
        score_breakdown['citation_bonus'] = citation_bonus
    if paper.pdf_url:
        score_breakdown['pdf_bonus'] = 3.0

    scope_penalty, domain_hits = _scope_penalty(
        title_tokens,
        abstract_tokens,
        query_profile,
        is_classic_seed=classic_seed_hit,
    )
    if scope_penalty:
        score_breakdown['narrow_domain_penalty'] = -scope_penalty

    rank_score = topic_match_score + sum(value for key, value in score_breakdown.items() if key != 'topic_match_score')
    score_breakdown['topic_match_score'] = topic_match_score

    if not passed_topic_gate:
        score_breakdown['off_topic_penalty'] = -1000.0
        rank_score -= 1000.0

    if passed_topic_gate:
        filter_reason = 'passed_topic_gate'
    else:
        filter_reason = f"off_topic_missing_{'_'.join(missing_topics)}" if missing_topics else 'off_topic'

    ranking_parts: list[str] = []
    if title_exact_match or title_phrase_match or topic_title_hits:
        ranking_parts.append('标题命中主题')
    if matched_topic_families:
        ranking_parts.append(f"命中主题家族：{' / '.join(sorted(matched_topic_families))}")
    if abstract_phrase_match or topic_abstract_hits or abstract_token_overlap:
        ranking_parts.append('摘要补充相关性')
    if classic_seed_hit and classic_seed is not None:
        ranking_parts.append(f'命中经典必读种子：{classic_seed.canonical_title}')
    if scope_penalty and domain_hits:
        ranking_parts.append(f"偏垂直应用场景：{', '.join(domain_hits)}")
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
    topic_families = [term for term in matched_terms if term in {'llm', 'agent', 'rag', 'reasoning', 'tool_use', 'multimodal', 'alignment', 'fine_tuning'}]
    if topic_families:
        summary_parts.append(f"命中主题家族：{' / '.join(topic_families[:4])}")
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
