from __future__ import annotations

import httpx

from app.services.paper_search.base import SearchPaper

SEMANTIC_SCHOLAR_API = 'https://api.semanticscholar.org/graph/v1/paper/search'


class SemanticScholarSearchService:
    async def search(self, query: str, limit: int = 10) -> list[SearchPaper]:
        params = {
            'query': query,
            'limit': limit,
            'fields': 'title,abstract,authors,year,venue,externalIds,openAccessPdf,url',
        }
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(SEMANTIC_SCHOLAR_API, params=params)
            response.raise_for_status()
            payload = response.json()

        papers: list[SearchPaper] = []
        for item in payload.get('data', []):
            paper_id = item.get('externalIds', {}).get('ArXiv') or item.get('paperId') or ''
            authors = ', '.join([a.get('name', '') for a in item.get('authors', []) if a.get('name')])
            pdf_url = (item.get('openAccessPdf') or {}).get('url', '')
            papers.append(
                SearchPaper(
                    source='semantic_scholar',
                    source_id=str(paper_id),
                    title_en=item.get('title', ''),
                    abstract_en=item.get('abstract', '') or '',
                    authors=authors,
                    year=item.get('year'),
                    venue=item.get('venue') or 'Semantic Scholar',
                    pdf_url=pdf_url,
                )
            )
        return papers
