from app.services.paper_search.base import SearchPaper


def test_search(client, monkeypatch):
    async def fake_arxiv(query: str, limit: int = 10):
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
        return []

    monkeypatch.setattr('app.api.routes.papers.arxiv_service.search', fake_arxiv)
    monkeypatch.setattr('app.api.routes.papers.semantic_service.search', fake_semantic)

    response = client.post('/papers/search', json={'query': 'test', 'sources': ['arxiv', 'semantic_scholar'], 'limit': 5})
    assert response.status_code == 200
    data = response.json()['items']
    assert len(data) == 1
    assert data[0]['title_en'] == 'Test Paper'
