from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.db.research_project_record import (
    ResearchProjectRecord,
    ResearchProjectSavedSearchCandidateRecord,
    ResearchProjectSavedSearchRecord,
    ResearchProjectSearchRunRecord,
)
from app.models.schemas.paper import PaperSearchRequest, SearchCandidateOut
from app.models.schemas.project import ProjectSearchFilters
from app.services.llm.provider_registry import get_primary_provider
from app.services.paper_search.classic_seeds import ClassicPaperSeed, match_classic_seed, relevant_classic_seeds
from app.services.paper_search.normalizer import build_query_profile
from app.services.paper_search.service import paper_search_service


MAX_TARGET_COUNT = 200
MIN_TARGET_COUNT = 20
MAX_QUERY_COUNT = 6
MIN_QUERY_COUNT = 4
MAX_POOL_SIZE = 320
MIN_POOL_SIZE = 120
_CJK_RE = re.compile(r'[\u3400-\u4dbf\u4e00-\u9fff]')
BUCKET_ORDER = ['classic_foundations', 'core_must_read', 'recent_frontier', 'repro_ready']
BUCKET_LABELS = {
    'classic_foundations': '基础经典',
    'core_must_read': '核心必读',
    'recent_frontier': '近期前沿',
    'repro_ready': '推荐复现',
}
SELECTION_TARGETS = {
    'balanced': {
        'classic_foundations': 20,
        'core_must_read': 35,
        'recent_frontier': 25,
        'repro_ready': 20,
    },
    'repro_first': {
        'classic_foundations': 15,
        'core_must_read': 25,
        'recent_frontier': 20,
        'repro_ready': 40,
    },
    'frontier_first': {
        'classic_foundations': 10,
        'core_must_read': 30,
        'recent_frontier': 40,
        'repro_ready': 20,
    },
}
STOP_TOKENS = {
    'the', 'and', 'for', 'with', 'from', 'using', 'towards', 'based', 'into', 'over',
    'study', 'paper', 'model', 'models', 'approach', 'method', 'methods',
}
REPRO_KEYWORDS = {
    'code', 'github', 'benchmark', 'dataset', 'datasets', 'evaluation', 'implementation',
    'reproduce', 'reproducibility', 'ablation', 'open-source', 'open source',
}
SURVEY_HINTS = {'survey', 'review', 'overview'}
DOMAIN_APPLICATION_HINTS = {
    'biomedical', 'biomedicine', 'clinical', 'medical', 'health', 'healthcare', 'video', 'video editing',
    'urban', 'smart city', 'water', 'geoscience', 'finance', 'financial', 'drug', 'hardware',
    'hardware security', 'security', 'phishing', 'circuit', 'materials', 'material intelligence',
    'power', 'powerpoint', 'office task', 'german', 'arabic', 'taiwan', 'openfoam',
    'fluid', 'fluid dynamics', 'critical infrastructure', 'musculoskeletal',
}
PRIMARY_TOPIC_KEYS = {'llm', 'agent', 'rag', 'multimodal'}
SEED_RECALL_LIMIT = 12
SOURCE_STABILITY_RANK = {'openalex': 3, 'semantic_scholar': 2, 'arxiv': 1}
_NON_ALNUM_RE = re.compile(r'[^a-z0-9]+')
TOPIC_FAMILY_HINTS: dict[str, tuple[str, ...]] = {
    'llm': (
        'large language model',
        'large language models',
        'language model',
        'language models',
        'llm',
        'llms',
        'foundation model',
        'foundation models',
        'transformer',
        'gpt',
    ),
    'agent': (
        'agent',
        'agents',
        'agentic',
        'multi agent',
        'multi-agent',
        'autonomous agent',
        'autonomous agents',
        'autogen',
        'voyager',
        'generative agents',
    ),
    'rag': (
        'retrieval augmented generation',
        'retrieval-augmented generation',
        'retrieval augmented',
        'rag',
    ),
    'reasoning': (
        'reasoning',
        'chain of thought',
        'chain-of-thought',
        'tree of thoughts',
        'self-consistency',
        'zero-shot reasoners',
    ),
    'tool_use': (
        'tool use',
        'tool-use',
        'tool calling',
        'function calling',
        'api calling',
        'toolformer',
        'react',
    ),
    'multimodal': (
        'multimodal',
        'multi modal',
        'vision language',
        'vision-language',
        'vlm',
    ),
}


@dataclass(slots=True)
class CuratedCandidate:
    item: SearchCandidateOut
    topic_score: float
    diversity_score: float
    impact_score: float
    freshness_score: float
    repro_score: float
    seed_score: float
    generality_score: float
    application_penalty: float
    overall_score: float
    classic_score: float
    frontier_score: float
    novelty_penalty: float = 0.0
    is_classic_seed: bool = False
    is_survey: bool = False
    seed_key: str = ''
    seed_priority: int = 0
    topic_families: frozenset[str] = frozenset()
    bucket: str = ''


@dataclass(slots=True)
class CuratedSearchMetrics:
    planned_query_count: int = 0
    executed_query_count: int = 0
    desired_pool_size: int = 0
    raw_candidate_count: int = 0
    canonical_candidate_count: int = 0
    filtered_candidate_count: int = 0
    selected_count: int = 0
    preview_count: int = 0
    required_seed_count: int = 0
    recalled_seed_count: int = 0
    missing_seed_titles: list[str] = field(default_factory=list)


@dataclass(slots=True)
class CuratedSearchResult:
    saved_search: ResearchProjectSavedSearchRecord
    run: ResearchProjectSearchRunRecord
    items: list[SearchCandidateOut]
    planned_queries: list[str]
    warnings: list[str]
    metrics: CuratedSearchMetrics


def _clamp_target_count(target_count: int) -> int:
    return max(MIN_TARGET_COUNT, min(MAX_TARGET_COUNT, int(target_count or 100)))


def _normalize_sources(raw_sources: Iterable[str]) -> list[str]:
    allowed = {'arxiv', 'openalex', 'semantic_scholar'}
    cleaned = [item.strip() for item in raw_sources if item and item.strip() in allowed]
    return cleaned or ['arxiv', 'openalex', 'semantic_scholar']


def _safe_json_object(raw_text: str) -> dict:
    try:
        payload = json.loads(raw_text)
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


def _contains_cjk(text: str) -> bool:
    return bool(_CJK_RE.search(text or ''))


def _normalize_query_text(text: str) -> str:
    return ' '.join((text or '').strip().split())


def _dedupe_casefold(items: list[str]) -> list[str]:
    ordered: list[str] = []
    seen: set[str] = set()
    for item in items:
        normalized = _normalize_query_text(item)
        if not normalized:
            continue
        key = normalized.casefold()
        if key in seen:
            continue
        seen.add(key)
        ordered.append(normalized)
    return ordered


def _is_valid_english_search_query(query: str) -> bool:
    normalized = _normalize_query_text(query)
    if not normalized or _contains_cjk(normalized):
        return False
    tokens = normalized.split()
    if len(tokens) < 2 or len(tokens) > 16:
        return False
    alpha_ratio = sum(char.isascii() and char.isalpha() for char in normalized) / max(len(normalized), 1)
    return alpha_ratio >= 0.45


def _normalize_title_key(text: str) -> str:
    lowered = (text or '').strip().lower()
    return ' '.join(_NON_ALNUM_RE.sub(' ', lowered).split())


class ProjectCurationService:
    def _provider(self):
        return get_primary_provider()

    def _planning_slots(self, user_need: str, selection_profile: str) -> dict[str, bool]:
        profile = build_query_profile(user_need)
        normalized_need = user_need.lower()
        wants_repro = any(keyword in normalized_need for keyword in ('复现', '跑代码', '代码', 'reproduce', 'repro', 'code', 'open source'))
        wants_benchmark = any(keyword in normalized_need for keyword in ('benchmark', 'evaluation', '评测', '基准', '综述', 'survey', 'review'))
        wants_frontier = any(keyword in normalized_need for keyword in ('frontier', '前沿', 'recent', 'latest', '最新'))
        wants_rag = 'rag' in profile.matched_topic_keys

        return {
            'llm': 'llm' in profile.matched_topic_keys or not profile.matched_topic_keys,
            'agent': 'agent' in profile.matched_topic_keys,
            'reasoning': 'reasoning' in profile.matched_topic_keys or 'agent' in profile.matched_topic_keys,
            'tool_use': 'tool_use' in profile.matched_topic_keys or 'agent' in profile.matched_topic_keys,
            'rag': wants_rag,
            'multimodal': 'multimodal' in profile.matched_topic_keys,
            'wants_repro': wants_repro or selection_profile == 'repro_first',
            'wants_benchmark': wants_benchmark or selection_profile in {'balanced', 'frontier_first', 'repro_first'},
            'wants_frontier': wants_frontier or selection_profile == 'frontier_first',
        }

    def _fallback_queries(self, user_need: str, selection_profile: str) -> list[str]:
        slots = self._planning_slots(user_need, selection_profile)
        queries: list[str] = []

        if slots['llm'] and slots['agent']:
            queries.append('large language model agents survey')
            queries.append('agentic workflows large language models')
        elif slots['llm']:
            queries.append('large language models foundation models survey')
        elif slots['agent']:
            queries.append('language agents agentic workflows survey')

        if slots['reasoning'] or slots['tool_use']:
            queries.append('large language models reasoning planning tool use')

        if slots['wants_benchmark']:
            if slots['agent']:
                queries.append('large language model agents benchmark evaluation')
            else:
                queries.append('large language models benchmark evaluation')

        if slots['wants_repro']:
            if slots['agent']:
                queries.append('open-source large language model agents reproducibility code')
            else:
                queries.append('open-source large language models reproducibility code')

        if slots['rag']:
            queries.append('retrieval-augmented generation large language models')

        if slots['multimodal']:
            queries.append('multimodal large language models survey')

        if slots['wants_frontier']:
            if slots['agent']:
                queries.append('large language model agents recent advances')
            else:
                queries.append('large language models recent advances')

        if len(queries) < MIN_QUERY_COUNT:
            queries.extend(
                [
                    'large language models survey benchmark',
                    'language agents planning reasoning survey',
                    'foundation models benchmark evaluation',
                    'open-source large language models code',
                ]
            )

        cleaned = [query for query in _dedupe_casefold(queries) if _is_valid_english_search_query(query)]
        return cleaned[:MAX_QUERY_COUNT]

    def _validated_planned_queries(self, raw_queries: list[str]) -> list[str]:
        valid = [query for query in _dedupe_casefold(raw_queries) if _is_valid_english_search_query(query)]
        return valid[:MAX_QUERY_COUNT]

    async def plan_queries(self, user_need: str, selection_profile: str, target_count: int) -> list[str]:
        fallback = self._fallback_queries(user_need, selection_profile)
        provider = self._provider()
        if provider is None:
            return fallback[: max(MIN_QUERY_COUNT, min(MAX_QUERY_COUNT, len(fallback)))]

        prompt = (
            'You are planning literature search queries for a research notebook.\n'
            f'User need: {user_need}\n'
            f'Selection profile: {selection_profile}\n'
            f'Target count: {target_count}\n'
            'Return JSON only with the shape {"queries": ["...", "..."]}.\n'
            'Requirements:\n'
            '- produce 4 to 6 English academic-style search queries\n'
            '- queries must be concise, keyword-oriented, and not conversational\n'
            '- do not copy the user request verbatim\n'
            '- do not output any Chinese text\n'
            '- include foundational/core, methodology, evaluation, and reproducibility angles when relevant\n'
        )
        try:
            raw = await provider.complete(prompt, system_prompt='You generate structured JSON for paper search planning.')
            payload = _safe_json_object(raw.strip())
            queries = payload.get('queries', [])
            if isinstance(queries, list):
                cleaned = self._validated_planned_queries([str(item).strip() for item in queries if str(item).strip()])
                if MIN_QUERY_COUNT <= len(cleaned) <= MAX_QUERY_COUNT:
                    return cleaned
        except Exception:
            pass
        return fallback[: max(MIN_QUERY_COUNT, min(MAX_QUERY_COUNT, len(fallback)))]

    def _emit_progress(
        self,
        progress_callback: Callable[..., None] | None,
        *,
        step_key: str,
        status: str,
        message: str,
        related_paper_ids: list[int] | None = None,
        progress_current: int | None = None,
        progress_total: int | None = None,
        progress_unit: str = '',
        progress_meta: dict[str, Any] | None = None,
    ) -> None:
        if progress_callback is None:
            return
        progress_callback(
            step_key=step_key,
            status=status,
            message=message,
            related_paper_ids=related_paper_ids or [],
            progress_current=progress_current,
            progress_total=progress_total,
            progress_unit=progress_unit,
            progress_meta=progress_meta or {},
        )

    def _seed_match(self, item: SearchCandidateOut) -> ClassicPaperSeed | None:
        return match_classic_seed(item.paper.title_en)

    def _required_classic_seeds(self, user_need: str) -> list[ClassicPaperSeed]:
        profile = build_query_profile(user_need)
        topic_keys = profile.matched_topic_keys or ['llm']
        return relevant_classic_seeds(topic_keys, limit=SEED_RECALL_LIMIT)

    def _required_primary_topics(self, profile) -> set[str]:
        return {topic for topic in profile.matched_topic_keys if topic in PRIMARY_TOPIC_KEYS}

    def _candidate_topic_families(self, item: SearchCandidateOut) -> frozenset[str]:
        seed = self._seed_match(item)
        haystack = f"{item.paper.title_en} {item.paper.abstract_en}".lower().replace('-', ' ')
        families = {term for term in item.reason.matched_terms if term in TOPIC_FAMILY_HINTS}
        for family, hints in TOPIC_FAMILY_HINTS.items():
            if any(hint in haystack for hint in hints):
                families.add(family)
        if seed is not None:
            families.update(seed.topics)
        return frozenset(families)

    def _canonical_candidate_key(self, item: SearchCandidateOut) -> str:
        paper = item.paper
        seed = self._seed_match(item)
        if paper.doi:
            return f"doi:{paper.doi.strip().lower()}"
        if paper.openalex_id:
            return f"openalex:{paper.openalex_id.strip().lower()}"
        if paper.semantic_scholar_id:
            return f"semantic:{paper.semantic_scholar_id.strip().lower()}"
        if seed is not None:
            return f"seed:{seed.key}"
        return f"title:{_normalize_title_key(paper.title_en)}"

    def _candidate_preference(self, item: SearchCandidateOut) -> tuple[float, int, int, int, int]:
        paper = item.paper
        metadata_richness = sum(
            1
            for value in (
                paper.doi,
                paper.openalex_id,
                paper.semantic_scholar_id,
                paper.paper_url,
                paper.venue,
            )
            if value
        )
        return (
            float(item.rank_score),
            int(paper.citation_count or 0),
            1 if (paper.pdf_url or item.is_downloaded) else 0,
            metadata_richness,
            SOURCE_STABILITY_RANK.get(paper.source, 0),
        )

    def _candidate_is_better(self, current: SearchCandidateOut, candidate: SearchCandidateOut) -> bool:
        return self._candidate_preference(candidate) > self._candidate_preference(current)

    def _is_vertical_application_candidate(self, item: SearchCandidateOut) -> bool:
        haystack = f"{item.paper.title_en} {item.paper.abstract_en}".lower().replace('-', ' ')
        return any(token in haystack for token in DOMAIN_APPLICATION_HINTS)

    def _topic_match(self, user_need: str, item: SearchCandidateOut, *, profile=None) -> bool:
        profile = profile or build_query_profile(user_need)
        seed = self._seed_match(item)
        if seed is not None:
            return True
        if not profile.has_signal:
            return True
        topic_families = self._candidate_topic_families(item)
        required_primary_topics = self._required_primary_topics(profile)
        if required_primary_topics and not required_primary_topics.issubset(topic_families):
            return False
        if profile.requires_strict_match and not item.reason.passed_topic_gate:
            return False
        if self._is_vertical_application_candidate(item):
            generic_signals = {'reasoning', 'tool_use', 'rag', 'agent'}
            if not (generic_signals & topic_families):
                return False
        return bool(topic_families or item.reason.passed_topic_gate or item.reason.topic_match_score >= 45.0)

    def _repro_score(self, item: SearchCandidateOut) -> float:
        haystack = f"{item.paper.title_en} {item.paper.abstract_en}".lower()
        keyword_hits = sum(1 for keyword in REPRO_KEYWORDS if keyword in haystack)
        score = 0.0
        if item.paper.pdf_url or item.is_downloaded:
            score += 0.35
        if item.reproduction_count > 0:
            score += 0.25
        if item.repro_interest in {'medium', 'high'}:
            score += 0.1 if item.repro_interest == 'medium' else 0.2
        score += min(keyword_hits, 4) * 0.1
        return min(score, 1.0)

    def _candidate_tags(self, item: SearchCandidateOut) -> set[str]:
        tokens = set()
        haystack = f"{item.paper.title_en} {item.paper.abstract_en}".lower().replace('-', ' ')
        for raw in haystack.split():
            token = ''.join(ch for ch in raw if ch.isalnum())
            if len(token) < 4 or token in STOP_TOKENS:
                continue
            tokens.add(token)
            if len(tokens) >= 12:
                break
        tokens.update(term.lower() for term in item.reason.matched_terms[:6])
        return {token for token in tokens if token}

    def _normalize_scores(self, values: dict[int, float]) -> dict[int, float]:
        if not values:
            return {}
        min_value = min(values.values())
        max_value = max(values.values())
        if math.isclose(min_value, max_value):
            return {key: (1.0 if max_value > 0 else 0.0) for key in values}
        return {key: (value - min_value) / (max_value - min_value) for key, value in values.items()}

    def _generality_score(self, item: SearchCandidateOut) -> float:
        haystack = f"{item.paper.title_en} {item.paper.abstract_en}".lower().replace('-', ' ')
        generic_hits = sum(1 for token in SURVEY_HINTS if token in haystack)
        if 'benchmark' in haystack or 'evaluation' in haystack:
            generic_hits += 1
        if 'framework' in haystack or 'method' in haystack or 'planning' in haystack:
            generic_hits += 1
        return min(generic_hits / 4, 1.0)

    def _application_penalty(self, item: SearchCandidateOut) -> float:
        haystack = f"{item.paper.title_en} {item.paper.abstract_en}".lower().replace('-', ' ')
        hits = sum(1 for token in DOMAIN_APPLICATION_HINTS if token in haystack)
        return min(hits * 0.18, 0.72)

    def _has_seed_signal(self, item: SearchCandidateOut) -> bool:
        return self._seed_match(item) is not None

    def _novelty_penalty(self, item: SearchCandidateOut, current_year: int) -> float:
        year = item.paper.year or 0
        citations = int(item.paper.citation_count or 0)
        if year >= current_year and citations == 0:
            return 0.18
        if year >= current_year - 1 and citations <= 5:
            return 0.12
        if year >= current_year - 1 and citations <= 20:
            return 0.06
        return 0.0

    def _bucket_score(self, candidate: CuratedCandidate, bucket: str) -> float:
        if bucket == 'classic_foundations':
            return (
                (candidate.seed_score * 0.52)
                + (candidate.impact_score * 0.24)
                + ((1 - candidate.freshness_score) * 0.14)
                + (candidate.generality_score * 0.16)
                - (candidate.application_penalty * 0.30)
                - (candidate.novelty_penalty * 0.12)
            )
        if bucket == 'core_must_read':
            return (
                (candidate.topic_score * 0.30)
                + (candidate.generality_score * 0.22)
                + (candidate.impact_score * 0.18)
                + (candidate.seed_score * 0.16)
                + (candidate.repro_score * 0.08)
                + (candidate.diversity_score * 0.06)
                - (candidate.application_penalty * 0.30)
                - (candidate.novelty_penalty * 0.14)
            )
        if bucket == 'recent_frontier':
            return (
                (candidate.topic_score * 0.42)
                + (candidate.freshness_score * 0.24)
                + (candidate.diversity_score * 0.14)
                + (candidate.impact_score * 0.1)
                + (candidate.generality_score * 0.1)
                - (candidate.application_penalty * 0.20)
                - (candidate.novelty_penalty * 0.08)
            )
        if bucket == 'repro_ready':
            return (
                (candidate.topic_score * 0.30)
                + (candidate.repro_score * 0.42)
                + (candidate.generality_score * 0.08)
                + (candidate.diversity_score * 0.08)
                + (candidate.impact_score * 0.12)
                - (candidate.application_penalty * 0.24)
                - (candidate.novelty_penalty * 0.08)
            )
        return candidate.overall_score - (candidate.novelty_penalty * 0.12)

    def _eligible_for_bucket(self, candidate: CuratedCandidate, bucket: str, current_year: int) -> bool:
        year = candidate.item.paper.year or 0
        if bucket == 'classic_foundations':
            if candidate.application_penalty >= 0.18 and candidate.generality_score < 0.55 and not candidate.is_classic_seed:
                return False
            return year > 0 and year <= current_year - 2
        if bucket == 'core_must_read':
            if candidate.application_penalty >= 0.18 and candidate.generality_score < 0.45 and not candidate.is_classic_seed:
                return False
            return True
        if bucket == 'recent_frontier':
            if candidate.application_penalty >= 0.18 and candidate.generality_score < 0.45:
                return False
            return year >= current_year - 2
        if bucket == 'repro_ready':
            if candidate.application_penalty >= 0.18 and candidate.generality_score < 0.45:
                return False
            return candidate.repro_score >= 0.55
        return True

    def _should_stop_collecting(
        self,
        *,
        pooled_items: dict[str, SearchCandidateOut],
        normalized_target: int,
        processed_query_count: int,
        planned_query_count: int,
        required_seed_count: int,
        collected_seed_count: int,
    ) -> bool:
        if processed_query_count < min(2, planned_query_count):
            return False
        if len(pooled_items) >= min(max(int(normalized_target * 1.6), 72), MAX_POOL_SIZE) and collected_seed_count >= min(required_seed_count, 6):
            return True
        if processed_query_count >= planned_query_count:
            return True
        return False

    def _compose_reason_summary(self, candidate: CuratedCandidate) -> str:
        bucket_label = BUCKET_LABELS.get(candidate.bucket, 'AI 推荐')
        parts = [bucket_label]
        if candidate.is_classic_seed:
            parts.append('命中经典主干论文')
        elif candidate.seed_key:
            parts.append('命中经典主题种子')
        if candidate.item.reason.summary:
            parts.append(candidate.item.reason.summary)
        if candidate.generality_score >= 0.5:
            parts.append('适合作为通用主干阅读')
        if candidate.repro_score >= 0.5:
            parts.append('复现友好度较高')
        if candidate.application_penalty >= 0.18:
            parts.append('已控制垂直应用偏题风险')
        return '；'.join(parts)

    async def curate_project_saved_search(
        self,
        db: Session,
        *,
        project: ResearchProjectRecord,
        user_need: str,
        target_count: int,
        selection_profile: str,
        saved_search: ResearchProjectSavedSearchRecord | None = None,
        sources: list[str] | None = None,
        planned_queries: list[str] | None = None,
    ) -> tuple[ResearchProjectSavedSearchRecord, ResearchProjectSearchRunRecord, list[SearchCandidateOut], list[str], list[str]]:
        result = await self.curate_project_saved_search_result(
            db,
            project=project,
            user_need=user_need,
            target_count=target_count,
            selection_profile=selection_profile,
            saved_search=saved_search,
            sources=sources,
            planned_queries=planned_queries,
        )
        return result.saved_search, result.run, result.items, result.planned_queries, result.warnings

        normalized_need = ' '.join((user_need or '').split()).strip()
        if not normalized_need:
            raise ValueError('User need is required')

        normalized_profile = selection_profile if selection_profile in SELECTION_TARGETS else 'balanced'
        normalized_target = _clamp_target_count(target_count)
        normalized_sources = _normalize_sources(sources or ['arxiv', 'openalex', 'semantic_scholar'])
        planned_queries = [item.strip() for item in (planned_queries or []) if item and item.strip()]
        if not planned_queries:
            planned_queries = await self.plan_queries(normalized_need, normalized_profile, normalized_target)
        if not planned_queries:
            planned_queries = self._fallback_queries(normalized_need, normalized_profile)
        planned_queries = planned_queries[:MAX_QUERY_COUNT]

        desired_pool_size = min(max(int(normalized_target * 2.5), MIN_POOL_SIZE), MAX_POOL_SIZE)
        per_query_limit = min(max(math.ceil(desired_pool_size / max(len(planned_queries), 1)), 20), 60)

        pooled_by_paper_id: dict[int, SearchCandidateOut] = {}
        warnings: list[str] = []
        for index, query in enumerate(planned_queries, start=1):
            result = await paper_search_service.execute_search(
                db,
                PaperSearchRequest(
                    query=query,
                    sources=normalized_sources,
                    limit=per_query_limit,
                    project_id=project.id,
                    sort_mode='relevance',
                ),
            )
            for warning in result.warnings:
                if warning not in warnings:
                    warnings.append(warning)
            for item in result.items:
                if not self._topic_match(normalized_need, item):
                    continue
                current = pooled_by_paper_id.get(item.paper.id)
                if current is None or item.rank_score > current.rank_score:
                    pooled_by_paper_id[item.paper.id] = item
            if len(pooled_by_paper_id) >= desired_pool_size or self._should_stop_collecting(
                pooled_items=pooled_by_paper_id,
                normalized_target=normalized_target,
                processed_query_count=index,
            ):
                break

        pooled_items = list(pooled_by_paper_id.values())
        if not pooled_items:
            raise ValueError('No relevant papers matched the current research need')

        relevance_map = self._normalize_scores({item.paper.id: float(item.rank_score) for item in pooled_items})
        impact_map = self._normalize_scores({
            item.paper.id: math.log10(max(int(item.paper.citation_count or 0), 0) + 1)
            for item in pooled_items
        })
        years = [item.paper.year for item in pooled_items if item.paper.year is not None]
        if years:
            min_year = min(years)
            max_year = max(years)
            if min_year == max_year:
                freshness_map = {item.paper.id: 1.0 for item in pooled_items}
            else:
                freshness_map = {
                    item.paper.id: ((item.paper.year or min_year) - min_year) / (max_year - min_year)
                    for item in pooled_items
                }
        else:
            freshness_map = {item.paper.id: 0.0 for item in pooled_items}

        tag_frequency: dict[str, int] = {}
        tags_by_paper: dict[int, set[str]] = {}
        repro_map: dict[int, float] = {}
        seed_map: dict[int, float] = {}
        generality_raw: dict[int, float] = {}
        application_penalty_map: dict[int, float] = {}
        survey_map: dict[int, bool] = {}
        for item in pooled_items:
            tags = self._candidate_tags(item)
            tags_by_paper[item.paper.id] = tags
            repro_map[item.paper.id] = self._repro_score(item)
            # Surveys can supplement classics, but should not dominate them.
            survey_map[item.paper.id] = any(hint in item.paper.title_en.lower() for hint in SURVEY_HINTS)
            seed_map[item.paper.id] = 1.0 if self._has_seed_signal(item) else 0.0
            generality_raw[item.paper.id] = self._generality_score(item)
            application_penalty_map[item.paper.id] = self._application_penalty(item)
            for tag in tags:
                tag_frequency[tag] = tag_frequency.get(tag, 0) + 1

        diversity_map: dict[int, float] = {}
        for item in pooled_items:
            tags = tags_by_paper[item.paper.id]
            if not tags:
                diversity_map[item.paper.id] = 0.0
                continue
            rarity_scores = [1 / tag_frequency[tag] for tag in tags if tag_frequency.get(tag)]
            diversity_map[item.paper.id] = sum(rarity_scores) / len(rarity_scores)
        diversity_map = self._normalize_scores(diversity_map)
        generality_map = self._normalize_scores(generality_raw)

        curated_candidates: list[CuratedCandidate] = []
        for item in pooled_items:
            paper_id = item.paper.id
            topic_score = relevance_map.get(paper_id, 0.0)
            diversity_score = diversity_map.get(paper_id, 0.0)
            impact_score = impact_map.get(paper_id, 0.0)
            freshness_score = freshness_map.get(paper_id, 0.0)
            repro_score = repro_map.get(paper_id, 0.0)
            seed_score = seed_map.get(paper_id, 0.0)
            generality_score = generality_map.get(paper_id, 0.0)
            application_penalty = application_penalty_map.get(paper_id, 0.0)
            overall_score = (
                (topic_score * 0.34)
                + (seed_score * 0.22)
                + (generality_score * 0.14)
                + (impact_score * 0.10)
                + (freshness_score * 0.08)
                + (diversity_score * 0.08)
                + (repro_score * 0.14)
                - (application_penalty * 0.18)
            )
            curated_candidates.append(
                CuratedCandidate(
                    item=item,
                    topic_score=topic_score,
                    diversity_score=diversity_score,
                    impact_score=impact_score,
                    freshness_score=freshness_score,
                    repro_score=repro_score,
                    seed_score=seed_score,
                    generality_score=generality_score,
                    application_penalty=application_penalty,
                    overall_score=overall_score,
                    classic_score=(seed_score * 0.45) + (impact_score * 0.25) + ((1 - freshness_score) * 0.12) + (generality_score * 0.18) - (application_penalty * 0.22),
                    frontier_score=(topic_score * 0.42) + (freshness_score * 0.24) + (diversity_score * 0.14) + (impact_score * 0.1) + (generality_score * 0.1),
                    is_classic_seed=bool(seed_score),
                    is_survey=survey_map.get(paper_id, False),
                )
            )

        current_year = datetime.now(timezone.utc).year
        selected: list[CuratedCandidate] = []
        used_paper_ids: set[int] = set()
        targets = SELECTION_TARGETS[normalized_profile]

        def select_bucket(bucket: str) -> None:
            desired = min(targets.get(bucket, 0), normalized_target - len(selected))
            if desired <= 0:
                return
            ranked = sorted(
                [candidate for candidate in curated_candidates if candidate.item.paper.id not in used_paper_ids and self._eligible_for_bucket(candidate, bucket, current_year)],
                key=lambda candidate: self._bucket_score(candidate, bucket),
                reverse=True,
            )
            chosen: list[CuratedCandidate] = []
            survey_cap = max(1, desired // 4) if bucket == 'classic_foundations' else desired
            survey_count = 0
            for candidate in ranked:
                if len(chosen) >= desired:
                    break
                if bucket == 'classic_foundations' and candidate.is_survey and survey_count >= survey_cap:
                    continue
                chosen.append(candidate)
                if candidate.is_survey:
                    survey_count += 1

            if len(chosen) < desired:
                for candidate in ranked:
                    if len(chosen) >= desired or candidate in chosen:
                        continue
                    chosen.append(candidate)

            for candidate in chosen:
                candidate.bucket = bucket
                selected.append(candidate)
                used_paper_ids.add(candidate.item.paper.id)

        select_bucket('classic_foundations')
        select_bucket('core_must_read')
        select_bucket('recent_frontier')
        select_bucket('repro_ready')

        if len(selected) < normalized_target:
            fallback_ranked = sorted(
                [candidate for candidate in curated_candidates if candidate.item.paper.id not in used_paper_ids],
                key=lambda candidate: candidate.overall_score,
                reverse=True,
            )
            for candidate in fallback_ranked[: normalized_target - len(selected)]:
                candidate.bucket = candidate.bucket or 'core_must_read'
                selected.append(candidate)
                used_paper_ids.add(candidate.item.paper.id)

        ordered_selection: list[CuratedCandidate] = []
        for bucket in BUCKET_ORDER:
            bucket_items = [candidate for candidate in selected if candidate.bucket == bucket]
            bucket_items.sort(key=lambda candidate: self._bucket_score(candidate, bucket), reverse=True)
            ordered_selection.extend(bucket_items)

        if len(ordered_selection) < len(selected):
            leftovers = [candidate for candidate in selected if candidate not in ordered_selection]
            leftovers.sort(key=lambda candidate: candidate.overall_score, reverse=True)
            ordered_selection.extend(leftovers)

        selected_items: list[SearchCandidateOut] = []
        for index, candidate in enumerate(ordered_selection[:normalized_target], start=1):
            updated = candidate.item.model_copy(
                update={
                    'selected_by_ai': True,
                    'selection_bucket': candidate.bucket,
                    'selection_rank': index,
                    'rank_score': candidate.overall_score,
                    'reason': candidate.item.reason.model_copy(update={'summary': self._compose_reason_summary(candidate)}),
                }
            )
            selected_items.append(updated)

        filters = ProjectSearchFilters(sources=normalized_sources)
        if saved_search is None:
            saved_search = ResearchProjectSavedSearchRecord(
                project_id=project.id,
                title=f"AI 选文：{normalized_need[:40]}",
                query=normalized_need,
                filters_json=json.dumps(filters.model_dump(), ensure_ascii=False),
                search_mode='ai_curated',
                user_need=normalized_need,
                selection_profile=normalized_profile,
                target_count=normalized_target,
                sort_mode='relevance',
                last_run_id=None,
                last_result_count=0,
            )
            db.add(saved_search)
            db.commit()
            db.refresh(saved_search)
        else:
            saved_search.title = saved_search.title or f"AI 选文：{normalized_need[:40]}"
            saved_search.query = normalized_need
            saved_search.filters_json = json.dumps(filters.model_dump(), ensure_ascii=False)
            saved_search.search_mode = 'ai_curated'
            saved_search.user_need = normalized_need
            saved_search.selection_profile = normalized_profile
            saved_search.target_count = normalized_target
            saved_search.sort_mode = 'relevance'
            db.add(saved_search)
            db.commit()
            db.refresh(saved_search)

        run = ResearchProjectSearchRunRecord(
            project_id=project.id,
            saved_search_id=saved_search.id,
            query=normalized_need,
            filters_json=saved_search.filters_json,
            sort_mode='relevance',
            result_count=len(selected_items),
            warnings_json=json.dumps(warnings, ensure_ascii=False),
            created_at=datetime.now(timezone.utc),
        )
        db.add(run)
        db.commit()
        db.refresh(run)

        existing_candidates = {
            row.paper_id: row
            for row in db.execute(
                select(ResearchProjectSavedSearchCandidateRecord)
                .where(ResearchProjectSavedSearchCandidateRecord.saved_search_id == saved_search.id)
            ).scalars().all()
        }
        selected_paper_ids = {item.paper.id for item in selected_items}
        for item in selected_items:
            row = existing_candidates.get(item.paper.id)
            if row is None:
                row = ResearchProjectSavedSearchCandidateRecord(
                    saved_search_id=saved_search.id,
                    paper_id=item.paper.id,
                    rank_position=item.rank_position,
                    rank_score=item.rank_score,
                    reason_json=json.dumps(item.reason.model_dump(), ensure_ascii=False),
                    ai_reason_text='',
                    triage_status='new',
                    selected_by_ai=True,
                    selection_bucket=item.selection_bucket,
                    selection_rank=item.selection_rank,
                    first_seen_run_id=run.id,
                    last_seen_run_id=run.id,
                )
            else:
                row.rank_position = item.rank_position
                row.rank_score = item.rank_score
                row.reason_json = json.dumps(item.reason.model_dump(), ensure_ascii=False)
                row.selected_by_ai = True
                row.selection_bucket = item.selection_bucket
                row.selection_rank = item.selection_rank
                row.last_seen_run_id = run.id
            db.add(row)

        for paper_id, row in existing_candidates.items():
            if paper_id not in selected_paper_ids:
                db.delete(row)

        saved_search.last_run_id = run.id
        saved_search.last_result_count = len(selected_items)
        db.add(saved_search)
        db.commit()
        db.refresh(saved_search)

        return saved_search, run, selected_items, planned_queries, warnings

    async def curate_project_saved_search_result(
        self,
        db: Session,
        *,
        project: ResearchProjectRecord,
        user_need: str,
        target_count: int,
        selection_profile: str,
        saved_search: ResearchProjectSavedSearchRecord | None = None,
        sources: list[str] | None = None,
        planned_queries: list[str] | None = None,
        progress_callback: Callable[..., None] | None = None,
    ) -> CuratedSearchResult:
        normalized_need = ' '.join((user_need or '').split()).strip()
        if not normalized_need:
            raise ValueError('User need is required')

        def add_warning(message: str) -> None:
            cleaned = message.strip()
            if cleaned and cleaned not in warnings:
                warnings.append(cleaned)

        normalized_profile = selection_profile if selection_profile in SELECTION_TARGETS else 'balanced'
        normalized_target = _clamp_target_count(target_count)
        normalized_sources = _normalize_sources(sources or ['arxiv', 'openalex', 'semantic_scholar'])
        profile = build_query_profile(normalized_need)
        planned_queries = [item.strip() for item in (planned_queries or []) if item and item.strip()]
        if not planned_queries:
            planned_queries = await self.plan_queries(normalized_need, normalized_profile, normalized_target)
        if not planned_queries:
            planned_queries = self._fallback_queries(normalized_need, normalized_profile)
        planned_queries = planned_queries[:MAX_QUERY_COUNT]

        metrics = CuratedSearchMetrics(
            planned_query_count=len(planned_queries),
            desired_pool_size=min(max(int(normalized_target * 2.2), MIN_POOL_SIZE), MAX_POOL_SIZE),
        )
        desired_pool_size = metrics.desired_pool_size
        per_query_limit = min(max(math.ceil(desired_pool_size / max(len(planned_queries), 1)), 20), 60)
        required_seeds = self._required_classic_seeds(normalized_need)
        required_seed_keys = {seed.key for seed in required_seeds}
        metrics.required_seed_count = len(required_seeds)

        pooled_by_key: dict[str, SearchCandidateOut] = {}
        warnings: list[str] = []

        self._emit_progress(
            progress_callback,
            step_key='collecting_candidates',
            status='running',
            message=f'正在执行 {len(planned_queries)} 条检索式并收集候选论文。',
            progress_current=0,
            progress_total=desired_pool_size,
            progress_unit='candidate',
            progress_meta={
                'completed_queries': 0,
                'total_queries': len(planned_queries),
                'raw_candidates': 0,
                'canonical_candidates': 0,
                'required_seed_count': metrics.required_seed_count,
                'recalled_seed_count': 0,
            },
        )

        for index, query in enumerate(planned_queries, start=1):
            result = await paper_search_service.execute_search(
                db,
                PaperSearchRequest(
                    query=query,
                    sources=normalized_sources,
                    limit=per_query_limit,
                    project_id=project.id,
                    sort_mode='relevance',
                ),
                provider_queries=[query],
                disable_seed_recall=True,
            )
            for warning in result.warnings:
                add_warning(warning)
            metrics.executed_query_count = index
            metrics.raw_candidate_count += len(result.items)
            for item in result.items:
                canonical_key = self._canonical_candidate_key(item)
                current = pooled_by_key.get(canonical_key)
                if current is None or self._candidate_is_better(current, item):
                    pooled_by_key[canonical_key] = item

            metrics.canonical_candidate_count = len(pooled_by_key)
            metrics.recalled_seed_count = len(
                {
                    seed.key
                    for item in pooled_by_key.values()
                    if (seed := self._seed_match(item)) is not None and seed.key in required_seed_keys
                }
            )

            self._emit_progress(
                progress_callback,
                step_key='collecting_candidates',
                status='running',
                message=f'已完成 {index}/{len(planned_queries)} 条检索式，累计收集 {len(pooled_by_key)} 个去重候选。',
                related_paper_ids=[item.paper.id for item in list(pooled_by_key.values())[:8]],
                progress_current=min(len(pooled_by_key), desired_pool_size),
                progress_total=desired_pool_size,
                progress_unit='candidate',
                progress_meta={
                    'completed_queries': index,
                    'total_queries': len(planned_queries),
                    'raw_candidates': metrics.raw_candidate_count,
                    'canonical_candidates': len(pooled_by_key),
                    'required_seed_count': metrics.required_seed_count,
                    'recalled_seed_count': metrics.recalled_seed_count,
                    'current_query': query,
                },
            )

            if len(pooled_by_key) >= desired_pool_size or self._should_stop_collecting(
                pooled_items=pooled_by_key,
                normalized_target=normalized_target,
                processed_query_count=index,
                planned_query_count=len(planned_queries),
                required_seed_count=metrics.required_seed_count,
                collected_seed_count=metrics.recalled_seed_count,
            ):
                break

        preferred_seed_sources = [source for source in ('openalex', 'semantic_scholar', 'arxiv') if source in normalized_sources]
        if not preferred_seed_sources:
            preferred_seed_sources = normalized_sources

        missing_seed_candidates = [
            seed
            for seed in required_seeds
            if seed.key
            not in {
                matched_seed.key
                for item in pooled_by_key.values()
                if (matched_seed := self._seed_match(item)) is not None
            }
        ]
        for index, seed in enumerate(missing_seed_candidates, start=1):
            found_match = False
            for source in preferred_seed_sources:
                result = await paper_search_service.execute_search(
                    db,
                    PaperSearchRequest(
                        query=seed.canonical_title,
                        sources=[source],
                        limit=3,
                        project_id=project.id,
                        sort_mode='relevance',
                    ),
                    provider_queries=[seed.canonical_title],
                    disable_seed_recall=True,
                )
                for warning in result.warnings:
                    add_warning(warning)
                matched_item = next(
                    (
                        item
                        for item in result.items
                        if (matched_seed := self._seed_match(item)) is not None and matched_seed.key == seed.key
                    ),
                    None,
                )
                if matched_item is None:
                    continue
                canonical_key = self._canonical_candidate_key(matched_item)
                current = pooled_by_key.get(canonical_key)
                if current is None or self._candidate_is_better(current, matched_item):
                    pooled_by_key[canonical_key] = matched_item
                found_match = True
                break

            metrics.canonical_candidate_count = len(pooled_by_key)
            metrics.recalled_seed_count = len(
                {
                    matched_seed.key
                    for item in pooled_by_key.values()
                    if (matched_seed := self._seed_match(item)) is not None and matched_seed.key in required_seed_keys
                }
            )
            self._emit_progress(
                progress_callback,
                step_key='collecting_candidates',
                status='running',
                message=f'正在补召回经典主干 {index}/{len(missing_seed_candidates)}：{seed.canonical_title}',
                related_paper_ids=[item.paper.id for item in list(pooled_by_key.values())[:8]],
                progress_current=min(len(pooled_by_key), desired_pool_size),
                progress_total=desired_pool_size,
                progress_unit='candidate',
                progress_meta={
                    'completed_queries': metrics.executed_query_count,
                    'total_queries': len(planned_queries),
                    'seed_recall_completed': index,
                    'seed_recall_total': len(missing_seed_candidates),
                    'raw_candidates': metrics.raw_candidate_count,
                    'canonical_candidates': len(pooled_by_key),
                    'required_seed_count': metrics.required_seed_count,
                    'recalled_seed_count': metrics.recalled_seed_count,
                    'seed_found': found_match,
                    'seed_title': seed.canonical_title,
                },
            )

        pooled_items = list(pooled_by_key.values())
        metrics.canonical_candidate_count = len(pooled_items)
        metrics.recalled_seed_count = len(
            {
                seed.key
                for item in pooled_items
                if (seed := self._seed_match(item)) is not None and seed.key in required_seed_keys
            }
        )
        metrics.missing_seed_titles = [
            seed.canonical_title
            for seed in required_seeds
            if seed.key
            not in {
                matched_seed.key
                for item in pooled_items
                if (matched_seed := self._seed_match(item)) is not None
            }
        ]
        if metrics.missing_seed_titles:
            add_warning(f"未召回经典必读：{'、'.join(metrics.missing_seed_titles)}")

        self._emit_progress(
            progress_callback,
            step_key='collecting_candidates',
            status='completed',
            message=f'候选收集完成，累计得到 {len(pooled_items)} 个 canonical 候选。',
            related_paper_ids=[item.paper.id for item in pooled_items[:10]],
            progress_current=min(len(pooled_items), desired_pool_size),
            progress_total=desired_pool_size,
            progress_unit='candidate',
            progress_meta={
                'completed_queries': metrics.executed_query_count,
                'total_queries': len(planned_queries),
                'raw_candidates': metrics.raw_candidate_count,
                'canonical_candidates': len(pooled_items),
                'required_seed_count': metrics.required_seed_count,
                'recalled_seed_count': metrics.recalled_seed_count,
            },
        )

        if not pooled_items:
            raise ValueError('No relevant papers matched the current research need')

        filtered_items = [item for item in pooled_items if self._topic_match(normalized_need, item, profile=profile)]
        metrics.filtered_candidate_count = len(filtered_items)
        self._emit_progress(
            progress_callback,
            step_key='deduping_and_filtering',
            status='completed',
            message=f'严格去重与切题过滤完成，保留 {len(filtered_items)}/{len(pooled_items)} 个候选。',
            related_paper_ids=[item.paper.id for item in filtered_items[:10]],
            progress_current=len(filtered_items),
            progress_total=max(len(pooled_items), 1),
            progress_unit='candidate',
            progress_meta={
                'raw_candidates': metrics.raw_candidate_count,
                'canonical_candidates': len(pooled_items),
                'filtered_candidates': len(filtered_items),
                'missing_seed_titles': metrics.missing_seed_titles,
            },
        )
        if not filtered_items:
            raise ValueError('No relevant papers matched the current research need')

        relevance_map = self._normalize_scores({item.paper.id: float(item.rank_score) for item in filtered_items})
        impact_map = self._normalize_scores({
            item.paper.id: math.log10(max(int(item.paper.citation_count or 0), 0) + 1)
            for item in filtered_items
        })
        years = [item.paper.year for item in filtered_items if item.paper.year is not None]
        if years:
            min_year = min(years)
            max_year = max(years)
            if min_year == max_year:
                freshness_map = {item.paper.id: 1.0 for item in filtered_items}
            else:
                freshness_map = {
                    item.paper.id: ((item.paper.year or min_year) - min_year) / (max_year - min_year)
                    for item in filtered_items
                }
        else:
            freshness_map = {item.paper.id: 0.0 for item in filtered_items}

        tag_frequency: dict[str, int] = {}
        tags_by_paper: dict[int, set[str]] = {}
        repro_map: dict[int, float] = {}
        seed_map: dict[int, float] = {}
        generality_raw: dict[int, float] = {}
        application_penalty_map: dict[int, float] = {}
        survey_map: dict[int, bool] = {}
        current_year = datetime.now(timezone.utc).year
        for item in filtered_items:
            tags = self._candidate_tags(item)
            tags_by_paper[item.paper.id] = tags
            repro_map[item.paper.id] = self._repro_score(item)
            survey_map[item.paper.id] = any(hint in item.paper.title_en.lower() for hint in SURVEY_HINTS)
            seed_map[item.paper.id] = 1.0 if self._has_seed_signal(item) else 0.0
            generality_raw[item.paper.id] = self._generality_score(item)
            application_penalty_map[item.paper.id] = self._application_penalty(item)
            for tag in tags:
                tag_frequency[tag] = tag_frequency.get(tag, 0) + 1

        diversity_map: dict[int, float] = {}
        for item in filtered_items:
            tags = tags_by_paper[item.paper.id]
            if not tags:
                diversity_map[item.paper.id] = 0.0
                continue
            rarity_scores = [1 / tag_frequency[tag] for tag in tags if tag_frequency.get(tag)]
            diversity_map[item.paper.id] = sum(rarity_scores) / len(rarity_scores)
        diversity_map = self._normalize_scores(diversity_map)
        generality_map = self._normalize_scores(generality_raw)

        curated_candidates: list[CuratedCandidate] = []
        for item in filtered_items:
            paper_id = item.paper.id
            seed = self._seed_match(item)
            topic_score = relevance_map.get(paper_id, 0.0)
            diversity_score = diversity_map.get(paper_id, 0.0)
            impact_score = impact_map.get(paper_id, 0.0)
            freshness_score = freshness_map.get(paper_id, 0.0)
            repro_score = repro_map.get(paper_id, 0.0)
            seed_score = seed_map.get(paper_id, 0.0)
            generality_score = generality_map.get(paper_id, 0.0)
            application_penalty = application_penalty_map.get(paper_id, 0.0)
            novelty_penalty = self._novelty_penalty(item, current_year)
            overall_score = (
                (topic_score * 0.34)
                + (seed_score * 0.22)
                + (generality_score * 0.14)
                + (impact_score * 0.10)
                + (freshness_score * 0.08)
                + (diversity_score * 0.08)
                + (repro_score * 0.14)
                - (application_penalty * 0.22)
                - (novelty_penalty * 0.12)
            )
            curated_candidates.append(
                CuratedCandidate(
                    item=item,
                    topic_score=topic_score,
                    diversity_score=diversity_score,
                    impact_score=impact_score,
                    freshness_score=freshness_score,
                    repro_score=repro_score,
                    seed_score=seed_score,
                    generality_score=generality_score,
                    application_penalty=application_penalty,
                    overall_score=overall_score,
                    classic_score=(seed_score * 0.45) + (impact_score * 0.25) + ((1 - freshness_score) * 0.12) + (generality_score * 0.18) - (application_penalty * 0.22) - (novelty_penalty * 0.12),
                    frontier_score=(topic_score * 0.42) + (freshness_score * 0.24) + (diversity_score * 0.14) + (impact_score * 0.1) + (generality_score * 0.1) - (novelty_penalty * 0.08),
                    novelty_penalty=novelty_penalty,
                    is_classic_seed=seed is not None,
                    is_survey=survey_map.get(paper_id, False),
                    seed_key=seed.key if seed is not None else '',
                    seed_priority=seed.priority if seed is not None else 0,
                    topic_families=self._candidate_topic_families(item),
                )
            )

        selected: list[CuratedCandidate] = []
        used_paper_ids: set[int] = set()
        targets = SELECTION_TARGETS[normalized_profile]
        bucket_counts = {bucket: 0 for bucket in BUCKET_ORDER}

        def inferred_bucket(candidate: CuratedCandidate) -> str:
            eligible_scores = [
                (bucket, self._bucket_score(candidate, bucket))
                for bucket in BUCKET_ORDER
                if self._eligible_for_bucket(candidate, bucket, current_year)
            ]
            if not eligible_scores:
                return 'core_must_read'
            eligible_scores.sort(key=lambda item: item[1], reverse=True)
            return eligible_scores[0][0]

        def append_candidate(candidate: CuratedCandidate, bucket: str) -> bool:
            if candidate.item.paper.id in used_paper_ids:
                return False
            candidate.bucket = bucket
            selected.append(candidate)
            used_paper_ids.add(candidate.item.paper.id)
            bucket_counts[bucket] = bucket_counts.get(bucket, 0) + 1
            if len(selected) == 1 or len(selected) == normalized_target or len(selected) % 5 == 0:
                self._emit_progress(
                    progress_callback,
                    step_key='reranking_candidates',
                    status='running',
                    message=f'正在锁定入选论文，当前已确定 {len(selected)}/{normalized_target} 篇。',
                    related_paper_ids=[item.item.paper.id for item in selected[-5:]],
                    progress_current=len(selected),
                    progress_total=normalized_target,
                    progress_unit='paper',
                    progress_meta={
                        'bucket': bucket,
                        'bucket_count': bucket_counts.get(bucket, 0),
                        'bucket_target': min(targets.get(bucket, 0), normalized_target),
                    },
                )
            return True

        def select_bucket(bucket: str) -> None:
            desired = min(targets.get(bucket, 0), normalized_target - len(selected))
            if desired <= 0:
                return
            ranked = sorted(
                [
                    candidate
                    for candidate in curated_candidates
                    if candidate.item.paper.id not in used_paper_ids and self._eligible_for_bucket(candidate, bucket, current_year)
                ],
                key=lambda candidate: (self._bucket_score(candidate, bucket), candidate.seed_priority, candidate.impact_score),
                reverse=True,
            )
            survey_cap = max(1, math.floor(desired * 0.25)) if bucket == 'classic_foundations' and desired > 0 else desired
            survey_count = 0

            if bucket == 'classic_foundations':
                seed_ranked = sorted(
                    [candidate for candidate in ranked if candidate.seed_key and candidate.seed_key in required_seed_keys],
                    key=lambda candidate: (candidate.seed_priority, self._bucket_score(candidate, bucket)),
                    reverse=True,
                )
                for candidate in seed_ranked:
                    if bucket_counts[bucket] >= desired:
                        break
                    if candidate.is_survey and survey_count >= survey_cap:
                        continue
                    if append_candidate(candidate, bucket) and candidate.is_survey:
                        survey_count += 1

            for candidate in ranked:
                if bucket_counts[bucket] >= desired:
                    break
                if bucket == 'classic_foundations' and candidate.is_survey and survey_count >= survey_cap:
                    continue
                if append_candidate(candidate, bucket) and candidate.is_survey:
                    survey_count += 1

        select_bucket('classic_foundations')
        select_bucket('core_must_read')
        select_bucket('recent_frontier')
        select_bucket('repro_ready')

        if len(selected) < normalized_target:
            fallback_ranked = sorted(
                [candidate for candidate in curated_candidates if candidate.item.paper.id not in used_paper_ids],
                key=lambda candidate: (candidate.overall_score, candidate.seed_priority, candidate.impact_score),
                reverse=True,
            )
            for candidate in fallback_ranked[: normalized_target - len(selected)]:
                append_candidate(candidate, inferred_bucket(candidate))

        metrics.selected_count = len(selected)
        self._emit_progress(
            progress_callback,
            step_key='reranking_candidates',
            status='completed',
            message=f'重排与分桶完成，已锁定 {len(selected)}/{normalized_target} 篇预览论文。',
            related_paper_ids=[candidate.item.paper.id for candidate in selected[:10]],
            progress_current=len(selected),
            progress_total=normalized_target,
            progress_unit='paper',
            progress_meta={'bucket_counts': bucket_counts},
        )

        ordered_selection: list[CuratedCandidate] = []
        for bucket in BUCKET_ORDER:
            bucket_items = [candidate for candidate in selected if candidate.bucket == bucket]
            bucket_items.sort(key=lambda candidate: (self._bucket_score(candidate, bucket), candidate.seed_priority, candidate.impact_score), reverse=True)
            ordered_selection.extend(bucket_items)

        if len(ordered_selection) < len(selected):
            leftovers = [candidate for candidate in selected if candidate not in ordered_selection]
            leftovers.sort(key=lambda candidate: (candidate.overall_score, candidate.seed_priority, candidate.impact_score), reverse=True)
            ordered_selection.extend(leftovers)

        self._emit_progress(
            progress_callback,
            step_key='building_preview',
            status='running',
            message=f'正在构建 AI 预览列表，共需写入 {min(len(ordered_selection), normalized_target)} 篇。',
            progress_current=0,
            progress_total=normalized_target,
            progress_unit='paper',
            progress_meta={'bucket_counts': bucket_counts},
        )
        selected_items: list[SearchCandidateOut] = []
        for index, candidate in enumerate(ordered_selection[:normalized_target], start=1):
            updated = candidate.item.model_copy(
                update={
                    'selected_by_ai': True,
                    'selection_bucket': candidate.bucket,
                    'selection_rank': index,
                    'rank_score': candidate.overall_score,
                    'reason': candidate.item.reason.model_copy(update={'summary': self._compose_reason_summary(candidate)}),
                }
            )
            selected_items.append(updated)
            if index == 1 or index == normalized_target or index % 10 == 0:
                self._emit_progress(
                    progress_callback,
                    step_key='building_preview',
                    status='running',
                    message=f'正在构建预览，已处理 {index}/{normalized_target} 篇。',
                    related_paper_ids=[item.paper.id for item in selected_items[-5:]],
                    progress_current=index,
                    progress_total=normalized_target,
                    progress_unit='paper',
                    progress_meta={'bucket': candidate.bucket},
                )

        metrics.preview_count = len(selected_items)
        self._emit_progress(
            progress_callback,
            step_key='building_preview',
            status='completed',
            message=f'AI 选文预览构建完成，共 {len(selected_items)} 篇。',
            related_paper_ids=[item.paper.id for item in selected_items[:10]],
            progress_current=len(selected_items),
            progress_total=normalized_target,
            progress_unit='paper',
            progress_meta={'bucket_counts': bucket_counts},
        )

        filters = ProjectSearchFilters(sources=normalized_sources)
        if saved_search is None:
            saved_search = ResearchProjectSavedSearchRecord(
                project_id=project.id,
                title=f"AI 选文：{normalized_need[:40]}",
                query=normalized_need,
                filters_json=json.dumps(filters.model_dump(), ensure_ascii=False),
                search_mode='ai_curated',
                user_need=normalized_need,
                selection_profile=normalized_profile,
                target_count=normalized_target,
                sort_mode='relevance',
                last_run_id=None,
                last_result_count=0,
            )
            db.add(saved_search)
            db.commit()
            db.refresh(saved_search)
        else:
            saved_search.title = saved_search.title or f"AI 选文：{normalized_need[:40]}"
            saved_search.query = normalized_need
            saved_search.filters_json = json.dumps(filters.model_dump(), ensure_ascii=False)
            saved_search.search_mode = 'ai_curated'
            saved_search.user_need = normalized_need
            saved_search.selection_profile = normalized_profile
            saved_search.target_count = normalized_target
            saved_search.sort_mode = 'relevance'
            db.add(saved_search)
            db.commit()
            db.refresh(saved_search)

        self._emit_progress(
            progress_callback,
            step_key='saving_preview',
            status='running',
            message='正在保存 AI 选文预览。',
            progress_current=0,
            progress_total=max(len(selected_items), 1),
            progress_unit='paper',
            progress_meta={'saved_search_id': saved_search.id},
        )

        run = ResearchProjectSearchRunRecord(
            project_id=project.id,
            saved_search_id=saved_search.id,
            query=normalized_need,
            filters_json=saved_search.filters_json,
            sort_mode='relevance',
            result_count=len(selected_items),
            warnings_json=json.dumps(warnings, ensure_ascii=False),
            created_at=datetime.now(timezone.utc),
        )
        db.add(run)
        db.commit()
        db.refresh(run)

        existing_candidates = {
            row.paper_id: row
            for row in db.execute(
                select(ResearchProjectSavedSearchCandidateRecord)
                .where(ResearchProjectSavedSearchCandidateRecord.saved_search_id == saved_search.id)
            ).scalars().all()
        }
        selected_paper_ids = {item.paper.id for item in selected_items}
        for item in selected_items:
            row = existing_candidates.get(item.paper.id)
            if row is None:
                row = ResearchProjectSavedSearchCandidateRecord(
                    saved_search_id=saved_search.id,
                    paper_id=item.paper.id,
                    rank_position=item.rank_position,
                    rank_score=item.rank_score,
                    reason_json=json.dumps(item.reason.model_dump(), ensure_ascii=False),
                    ai_reason_text='',
                    triage_status='new',
                    selected_by_ai=True,
                    selection_bucket=item.selection_bucket,
                    selection_rank=item.selection_rank,
                    first_seen_run_id=run.id,
                    last_seen_run_id=run.id,
                )
            else:
                row.rank_position = item.rank_position
                row.rank_score = item.rank_score
                row.reason_json = json.dumps(item.reason.model_dump(), ensure_ascii=False)
                row.selected_by_ai = True
                row.selection_bucket = item.selection_bucket
                row.selection_rank = item.selection_rank
                row.last_seen_run_id = run.id
            db.add(row)
            if item.selection_rank and (item.selection_rank == 1 or item.selection_rank == len(selected_items) or item.selection_rank % 10 == 0):
                self._emit_progress(
                    progress_callback,
                    step_key='saving_preview',
                    status='running',
                    message=f'正在保存预览结果，已写入 {item.selection_rank}/{len(selected_items)} 篇。',
                    related_paper_ids=[item.paper.id],
                    progress_current=item.selection_rank,
                    progress_total=len(selected_items),
                    progress_unit='paper',
                    progress_meta={'saved_search_id': saved_search.id, 'run_id': run.id},
                )

        for paper_id, row in existing_candidates.items():
            if paper_id not in selected_paper_ids:
                db.delete(row)

        saved_search.last_run_id = run.id
        saved_search.last_result_count = len(selected_items)
        db.add(saved_search)
        db.commit()
        db.refresh(saved_search)

        self._emit_progress(
            progress_callback,
            step_key='saving_preview',
            status='completed',
            message=f'AI 选文预览已保存，可确认加入 {len(selected_items)} 篇论文。',
            related_paper_ids=[item.paper.id for item in selected_items[:10]],
            progress_current=len(selected_items),
            progress_total=len(selected_items),
            progress_unit='paper',
            progress_meta={'saved_search_id': saved_search.id, 'run_id': run.id},
        )

        return CuratedSearchResult(
            saved_search=saved_search,
            run=run,
            items=selected_items,
            planned_queries=planned_queries,
            warnings=warnings,
            metrics=metrics,
        )


project_curation_service = ProjectCurationService()
