from __future__ import annotations

import asyncio
from typing import Any

import httpx

from app.models.db.paper_record import PaperRecord
from app.services.paper_search.base import SearchPaper

OPENALEX_API = 'https://api.openalex.org/works'


class OpenAlexSearchService:
    def _to_search_paper(self, item: dict[str, Any]) -> SearchPaper:
        title = item.get('title') or ''
        abstract = ''
        inv_idx = item.get('abstract_inverted_index') or {}
        if inv_idx:
            words: list[tuple[int, str]] = []
            for token, positions in inv_idx.items():
                for position in positions:
                    words.append((position, token))
            words.sort(key=lambda value: value[0])
            abstract = ' '.join(word for _, word in words)
        authors = ', '.join([entry.get('author', {}).get('display_name', '') for entry in item.get('authorships', []) if entry.get('author')])
        primary = item.get('primary_location') or {}
        ids = item.get('ids') or {}
        source_id = str(item.get('id', '')).split('/')[-1]
        doi = str(ids.get('doi') or '').removeprefix('https://doi.org/')
        return SearchPaper(
            source='openalex',
            source_id=source_id,
            title_en=title,
            abstract_en=abstract,
            authors=authors,
            year=item.get('publication_year'),
            venue=(primary.get('source') or {}).get('display_name', 'OpenAlex'),
            pdf_url=str(primary.get('pdf_url') or ''),
            doi=doi,
            paper_url=str(primary.get('landing_page_url') or item.get('id') or ''),
            openalex_id=source_id,
            citation_count=int(item.get('cited_by_count') or 0),
            reference_count=len(item.get('referenced_works') or []),
        )

    async def _get_json(self, url: str, *, params: dict[str, Any] | None = None) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=20, headers={'User-Agent': 'Research-Copilot/0.1'}) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            return response.json()

    async def search(self, query: str, limit: int = 10) -> list[SearchPaper]:
        payload = await self._get_json(OPENALEX_API, params={'search': query, 'per-page': limit})
        return [self._to_search_paper(item) for item in payload.get('results', [])]

    async def fetch_work(self, openalex_id: str) -> SearchPaper | None:
        normalized = openalex_id.strip()
        if not normalized:
            return None
        payload = await self._get_json(f'{OPENALEX_API}/{normalized}')
        return self._to_search_paper(payload)

    async def fetch_work_payload(self, openalex_id: str) -> dict[str, Any] | None:
        normalized = openalex_id.strip()
        if not normalized:
            return None
        return await self._get_json(f'{OPENALEX_API}/{normalized}')

    async def resolve_work(self, paper: PaperRecord) -> SearchPaper | None:
        if paper.openalex_id:
            return await self.fetch_work(paper.openalex_id)
        if paper.title_en.strip():
            results = await self.search(paper.title_en.strip(), limit=3)
            if results:
                return results[0]
        return None

    async def resolve_work_payload(self, paper: PaperRecord) -> dict[str, Any] | None:
        if paper.openalex_id:
            return await self.fetch_work_payload(paper.openalex_id)
        resolved = await self.resolve_work(paper)
        if resolved and resolved.openalex_id:
            return await self.fetch_work_payload(resolved.openalex_id)
        return None

    async def fetch_references(self, openalex_ids: list[str]) -> list[SearchPaper]:
        normalized = [item.strip() for item in openalex_ids if item and item.strip()]
        if not normalized:
            return []

        async def fetch_one(work_id: str) -> SearchPaper | None:
            try:
                return await self.fetch_work(work_id)
            except Exception:
                return None

        results = await asyncio.gather(*[fetch_one(work_id) for work_id in normalized[:12]])
        return [item for item in results if item is not None]

    async def fetch_cited_by(self, openalex_id: str, limit: int = 12) -> list[SearchPaper]:
        normalized = openalex_id.strip()
        if not normalized:
            return []
        payload = await self._get_json(OPENALEX_API, params={'filter': f'cites:{normalized}', 'per-page': limit})
        return [self._to_search_paper(item) for item in payload.get('results', [])]

    async def fetch_citation_trail(self, paper: PaperRecord, limit: int = 12) -> tuple[SearchPaper | None, list[SearchPaper], list[SearchPaper]]:
        resolved = await self.resolve_work(paper)
        if resolved is None or not resolved.openalex_id:
            return resolved, [], []

        work_payload = await self._get_json(f'{OPENALEX_API}/{resolved.openalex_id}')
        reference_ids = [str(item).split('/')[-1] for item in work_payload.get('referenced_works', [])][:limit]
        references, cited_by = await asyncio.gather(
            self.fetch_references(reference_ids),
            self.fetch_cited_by(resolved.openalex_id, limit=limit),
        )
        return resolved, references, cited_by
