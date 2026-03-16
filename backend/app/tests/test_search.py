from app.services.paper_search.base import SearchPaper


def test_search_uses_arxiv_only_even_if_other_sources_are_requested(client, monkeypatch):
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

    monkeypatch.setattr('app.api.routes.papers.arxiv_service.search', fake_arxiv)

    response = client.post('/papers/search', json={'query': 'test', 'sources': ['arxiv', 'semantic_scholar', 'openalex'], 'limit': 5})
    assert response.status_code == 200

    data = response.json()['items']
    assert len(data) == 1
    assert data[0]['title_en'] == 'Test Paper'
    assert calls['arxiv'] == 1
    assert calls['semantic'] == 0
    assert calls['openalex'] == 0
