from app.services.paper_search.base import SearchPaper


def test_search_respects_requested_sources_and_returns_rich_candidates(client, monkeypatch):
    calls = {'arxiv': 0, 'semantic': 0, 'openalex': 0}

    async def fake_arxiv(query: str, limit: int = 10):
        calls['arxiv'] += 1
        return [
            SearchPaper(
                source='arxiv',
                source_id='1234.5678',
                title_en='Test Paper',
                abstract_en='Abstract',
                authors='Alice, Bob',
                year=2024,
                venue='arXiv',
                pdf_url='https://arxiv.org/pdf/1234.5678.pdf',
            )
        ]

    async def fake_semantic(query: str, limit: int = 10):
        calls['semantic'] += 1
        return []

    async def fake_openalex(query: str, limit: int = 10):
        calls['openalex'] += 1
        return []

    monkeypatch.setattr('app.services.paper_search.service.paper_search_service.arxiv.search', fake_arxiv)
    monkeypatch.setattr('app.services.paper_search.service.paper_search_service.semantic_scholar.search', fake_semantic)
    monkeypatch.setattr('app.services.paper_search.service.paper_search_service.openalex.search', fake_openalex)

    response = client.post('/papers/search', json={'query': 'test', 'sources': ['arxiv', 'semantic_scholar', 'openalex'], 'limit': 5})
    assert response.status_code == 200

    data = response.json()['items']
    assert len(data) == 1
    assert data[0]['paper']['title_en'] == 'Test Paper'
    assert data[0]['paper']['source'] == 'arxiv'
    assert data[0]['reason']['matched_terms'] == ['test']
    assert 'title' in data[0]['reason']['matched_fields']
    assert calls['arxiv'] == 1
    assert calls['semantic'] == 1
    assert calls['openalex'] == 1
