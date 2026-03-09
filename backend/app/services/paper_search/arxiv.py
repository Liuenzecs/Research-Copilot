from __future__ import annotations

import re
import xml.etree.ElementTree as ET

import httpx

from app.services.paper_search.base import SearchPaper

ARXIV_API = 'http://export.arxiv.org/api/query'


class ArxivSearchService:
    async def search(self, query: str, limit: int = 10) -> list[SearchPaper]:
        params = {
            'search_query': f'all:{query}',
            'start': 0,
            'max_results': limit,
            'sortBy': 'relevance',
            'sortOrder': 'descending',
        }
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(ARXIV_API, params=params)
            response.raise_for_status()
        root = ET.fromstring(response.text)
        ns = {'atom': 'http://www.w3.org/2005/Atom'}
        papers: list[SearchPaper] = []
        for entry in root.findall('atom:entry', ns):
            entry_id = (entry.findtext('atom:id', default='', namespaces=ns) or '').strip()
            title = (entry.findtext('atom:title', default='', namespaces=ns) or '').strip().replace('\n', ' ')
            abstract = (
                (entry.findtext('atom:summary', default='', namespaces=ns) or '').strip().replace('\n', ' ')
            )
            published = (entry.findtext('atom:published', default='', namespaces=ns) or '').strip()
            authors = [a.findtext('atom:name', default='', namespaces=ns) or '' for a in entry.findall('atom:author', ns)]

            source_id = entry_id.rsplit('/', 1)[-1]
            source_id = re.sub(r'v\d+$', '', source_id)
            year = int(published[:4]) if len(published) >= 4 and published[:4].isdigit() else None
            pdf_url = f'https://arxiv.org/pdf/{source_id}.pdf'

            papers.append(
                SearchPaper(
                    source='arxiv',
                    source_id=source_id,
                    title_en=title,
                    abstract_en=abstract,
                    authors=', '.join([x for x in authors if x]),
                    year=year,
                    venue='arXiv',
                    pdf_url=pdf_url,
                )
            )
        return papers
