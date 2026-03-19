from __future__ import annotations

import httpx

from app.core.config import get_settings
from app.services.paper_search.base import SearchPaper

SEMANTIC_SCHOLAR_API = 'https://api.semanticscholar.org/graph/v1/paper/search'
SEMANTIC_SCHOLAR_PAPER_API = 'https://api.semanticscholar.org/graph/v1/paper'


class SemanticScholarSearchService:
    def _headers(self) -> dict[str, str]:
        settings = get_settings()
        headers = {'User-Agent': 'Research-Copilot/0.1'}
        if settings.semantic_scholar_api_key:
            headers['x-api-key'] = settings.semantic_scholar_api_key
        return headers

    def _to_search_paper(self, item: dict) -> SearchPaper:
        external_ids = item.get('externalIds', {}) or {}
        paper_id = external_ids.get('ArXiv') or item.get('paperId') or ''
        authors = ', '.join([a.get('name', '') for a in item.get('authors', []) if a.get('name')])
        pdf_url = (item.get('openAccessPdf') or {}).get('url', '')
        return SearchPaper(
            source='semantic_scholar',
            source_id=str(paper_id),
            title_en=item.get('title', ''),
            abstract_en=item.get('abstract', '') or '',
            authors=authors,
            year=item.get('year'),
            venue=item.get('venue') or 'Semantic Scholar',
            pdf_url=pdf_url,
            doi=str(external_ids.get('DOI') or ''),
            paper_url=str(item.get('url') or ''),
            semantic_scholar_id=str(item.get('paperId') or ''),
            citation_count=int(item.get('citationCount') or 0),
            reference_count=int(item.get('referenceCount') or 0),
        )

    async def search(self, query: str, limit: int = 10) -> list[SearchPaper]:
        params = {
            'query': query,
            'limit': limit,
            'fields': 'title,abstract,authors,year,venue,externalIds,openAccessPdf,url,citationCount,referenceCount',
        }

        async with httpx.AsyncClient(timeout=20, follow_redirects=True, headers=self._headers()) as client:
            response = await client.get(SEMANTIC_SCHOLAR_API, params=params)
            response.raise_for_status()
            payload = response.json()

        return [self._to_search_paper(item) for item in payload.get('data', [])]

    async def fetch_paper(self, paper_id: str) -> SearchPaper | None:
        normalized = paper_id.strip()
        if not normalized:
            return None
        params = {'fields': 'title,abstract,authors,year,venue,externalIds,openAccessPdf,url,citationCount,referenceCount'}
        async with httpx.AsyncClient(timeout=20, follow_redirects=True, headers=self._headers()) as client:
            response = await client.get(f'{SEMANTIC_SCHOLAR_PAPER_API}/{normalized}', params=params)
            response.raise_for_status()
            payload = response.json()
        return self._to_search_paper(payload)
