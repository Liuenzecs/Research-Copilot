from __future__ import annotations

import httpx

from app.services.paper_search.base import SearchPaper

OPENALEX_API = 'https://api.openalex.org/works'


class OpenAlexSearchService:
    async def search(self, query: str, limit: int = 10) -> list[SearchPaper]:
        params = {'search': query, 'per-page': limit}
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(OPENALEX_API, params=params)
            response.raise_for_status()
            payload = response.json()

        papers: list[SearchPaper] = []
        for item in payload.get('results', []):
            title = item.get('title') or ''
            abstract = ''
            inv_idx = item.get('abstract_inverted_index') or {}
            if inv_idx:
                words: list[tuple[int, str]] = []
                for token, positions in inv_idx.items():
                    for p in positions:
                        words.append((p, token))
                words.sort(key=lambda x: x[0])
                abstract = ' '.join([w for _, w in words])
            authors = ', '.join([a.get('author', {}).get('display_name', '') for a in item.get('authorships', [])])
            primary = item.get('primary_location') or {}
            source_id = str(item.get('id', '')).split('/')[-1]
            papers.append(
                SearchPaper(
                    source='openalex',
                    source_id=source_id,
                    title_en=title,
                    abstract_en=abstract,
                    authors=authors,
                    year=item.get('publication_year'),
                    venue=(primary.get('source') or {}).get('display_name', 'OpenAlex'),
                    pdf_url=(primary.get('pdf_url') or ''),
                )
            )
        return papers
