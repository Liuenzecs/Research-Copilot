from __future__ import annotations

import json
import math
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable

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
from app.services.llm.deepseek_provider import DeepSeekProvider
from app.services.llm.openai_provider import OpenAIProvider
from app.services.paper_search.normalizer import build_provider_queries, build_query_profile
from app.services.paper_search.service import paper_search_service


MAX_TARGET_COUNT = 200
MIN_TARGET_COUNT = 20
MAX_QUERY_COUNT = 10
MIN_QUERY_COUNT = 6
MAX_POOL_SIZE = 600
MIN_POOL_SIZE = 240
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


@dataclass(slots=True)
class CuratedCandidate:
    item: SearchCandidateOut
    topic_score: float
    diversity_score: float
    impact_score: float
    freshness_score: float
    repro_score: float
    overall_score: float
    classic_score: float
    frontier_score: float
    bucket: str = ''


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


class ProjectCurationService:
    def __init__(self) -> None:
        self.openai = OpenAIProvider()
        self.deepseek = DeepSeekProvider()

    def _provider(self):
        if self.openai.enabled:
            return self.openai
        if self.deepseek.enabled:
            return self.deepseek
        return None

    def _fallback_queries(self, user_need: str, selection_profile: str) -> list[str]:
        base_queries = build_provider_queries(user_need)
        if not base_queries:
            return []

        variants = list(base_queries)
        hints = [
            'survey',
            'benchmark',
            'evaluation',
            'recent advances',
            'systematic review',
            'code implementation',
        ]
        if selection_profile == 'repro_first':
            hints = ['benchmark', 'code implementation', 'open source', 'reproducibility', 'ablation', 'dataset']
        elif selection_profile == 'frontier_first':
            hints = ['latest advances', '2025', '2026', 'recent frontier', 'state of the art', 'agent']

        base = base_queries[0]
        for hint in hints:
            variants.append(f'{base} {hint}'.strip())
        deduped: list[str] = []
        for item in variants:
            normalized = ' '.join(item.split()).strip()
            if normalized and normalized.lower() not in {value.lower() for value in deduped}:
                deduped.append(normalized)
        return deduped[:MAX_QUERY_COUNT]

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
            '- 6 to 10 concise English search queries\n'
            '- maximize topical precision and coverage\n'
            '- avoid generic filler queries\n'
            '- include foundational, benchmark, and recent variants when appropriate\n'
        )
        try:
            raw = await provider.complete(prompt, system_prompt='You generate structured JSON for paper search planning.')
            payload = _safe_json_object(raw.strip())
            queries = payload.get('queries', [])
            if isinstance(queries, list):
                cleaned = [str(item).strip() for item in queries if str(item).strip()]
                if cleaned:
                    return cleaned[:MAX_QUERY_COUNT]
        except Exception:
            pass
        return fallback[: max(MIN_QUERY_COUNT, min(MAX_QUERY_COUNT, len(fallback)))]

    def _topic_match(self, user_need: str, item: SearchCandidateOut) -> bool:
        profile = build_query_profile(user_need)
        if not profile.has_signal:
            return True
        haystack = f"{item.paper.title_en} {item.paper.abstract_en}".lower()
        if any(query in haystack for query in profile.normalized_queries if query):
            return True
        return any(token in haystack for token in profile.query_tokens if len(token) >= 2)

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

    def _bucket_score(self, candidate: CuratedCandidate, bucket: str) -> float:
        if bucket == 'classic_foundations':
            return (candidate.topic_score * 0.45) + (candidate.impact_score * 0.35) + ((1 - candidate.freshness_score) * 0.2)
        if bucket == 'recent_frontier':
            return (candidate.topic_score * 0.45) + (candidate.freshness_score * 0.3) + (candidate.diversity_score * 0.15) + (candidate.impact_score * 0.1)
        if bucket == 'repro_ready':
            return (candidate.topic_score * 0.4) + (candidate.repro_score * 0.4) + (candidate.diversity_score * 0.1) + (candidate.impact_score * 0.1)
        return candidate.overall_score

    def _eligible_for_bucket(self, candidate: CuratedCandidate, bucket: str, current_year: int) -> bool:
        year = candidate.item.paper.year or 0
        if bucket == 'classic_foundations':
            return year > 0 and year <= current_year - 3
        if bucket == 'recent_frontier':
            return year >= current_year - 2
        if bucket == 'repro_ready':
            return candidate.repro_score >= 0.45
        return True

    def _compose_reason_summary(self, candidate: CuratedCandidate) -> str:
        bucket_label = BUCKET_LABELS.get(candidate.bucket, 'AI 推荐')
        parts = [bucket_label]
        if candidate.item.reason.summary:
            parts.append(candidate.item.reason.summary)
        if candidate.repro_score >= 0.5:
            parts.append('复现友好度较高')
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

        desired_pool_size = min(max(normalized_target * 4, MIN_POOL_SIZE), MAX_POOL_SIZE)
        per_query_limit = min(max(math.ceil(desired_pool_size / max(len(planned_queries), 1)), 24), 80)

        pooled_by_paper_id: dict[int, SearchCandidateOut] = {}
        warnings: list[str] = []
        for query in planned_queries:
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
            if len(pooled_by_paper_id) >= desired_pool_size:
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
        for item in pooled_items:
            tags = self._candidate_tags(item)
            tags_by_paper[item.paper.id] = tags
            repro_map[item.paper.id] = self._repro_score(item)
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

        curated_candidates: list[CuratedCandidate] = []
        for item in pooled_items:
            paper_id = item.paper.id
            topic_score = relevance_map.get(paper_id, 0.0)
            diversity_score = diversity_map.get(paper_id, 0.0)
            impact_score = impact_map.get(paper_id, 0.0)
            freshness_score = freshness_map.get(paper_id, 0.0)
            repro_score = repro_map.get(paper_id, 0.0)
            overall_score = (
                (topic_score * 0.45)
                + (diversity_score * 0.15)
                + (impact_score * 0.10)
                + (freshness_score * 0.10)
                + (repro_score * 0.20)
            )
            curated_candidates.append(
                CuratedCandidate(
                    item=item,
                    topic_score=topic_score,
                    diversity_score=diversity_score,
                    impact_score=impact_score,
                    freshness_score=freshness_score,
                    repro_score=repro_score,
                    overall_score=overall_score,
                    classic_score=(topic_score * 0.45) + (impact_score * 0.35) + ((1 - freshness_score) * 0.2),
                    frontier_score=(topic_score * 0.45) + (freshness_score * 0.3) + (diversity_score * 0.15) + (impact_score * 0.1),
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
            for candidate in ranked[:desired]:
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


project_curation_service = ProjectCurationService()
