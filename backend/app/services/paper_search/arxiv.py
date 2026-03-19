from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from collections import OrderedDict

import httpx

from app.services.paper_search.base import SearchPaper

ARXIV_API = 'https://export.arxiv.org/api/query'


class ArxivSearchService:
    @staticmethod
    def _parse_feed(xml_text: str) -> list[SearchPaper]:
        root = ET.fromstring(xml_text)
        ns = {'atom': 'http://www.w3.org/2005/Atom'}
        papers: list[SearchPaper] = []
        for entry in root.findall('atom:entry', ns):
            entry_id = (entry.findtext('atom:id', default='', namespaces=ns) or '').strip()
            title = (entry.findtext('atom:title', default='', namespaces=ns) or '').strip().replace('\n', ' ')
            abstract = (entry.findtext('atom:summary', default='', namespaces=ns) or '').strip().replace('\n', ' ')
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
                    paper_url=entry_id,
                )
            )
        return papers

    async def _fetch(self, client: httpx.AsyncClient, search_query: str, limit: int) -> list[SearchPaper]:
        params = {
            'search_query': search_query,
            'start': 0,
            'max_results': max(1, limit),
            'sortBy': 'relevance',
            'sortOrder': 'descending',
        }
        response = await client.get(ARXIV_API, params=params)
        response.raise_for_status()
        return self._parse_feed(response.text)

    async def search(self, query: str, limit: int = 10) -> list[SearchPaper]:
        clean_query = query.strip()
        if not clean_query:
            return []

        escaped_phrase = clean_query.replace('"', '')
        exact_limit = min(max(3, limit), 8)
        broad_limit = max(limit, 12)

        async with httpx.AsyncClient(
            timeout=20,
            follow_redirects=True,
            headers={'User-Agent': 'Research-Copilot/0.1'},
        ) as client:
            exact = await self._fetch(client, f'ti:"{escaped_phrase}"', exact_limit)
            broad = await self._fetch(client, f'all:{clean_query}', broad_limit)

        # Keep exact-title candidates first, then broader recall.
        by_source_id: OrderedDict[str, SearchPaper] = OrderedDict()
        for paper in [*exact, *broad]:
            key = paper.source_id.strip()
            if key and key not in by_source_id:
                by_source_id[key] = paper

        return list(by_source_id.values())
