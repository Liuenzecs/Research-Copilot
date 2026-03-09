from app.services.paper_search.base import SearchPaper


def test_quick_summary(client, monkeypatch):
    async def fake_arxiv(query: str, limit: int = 10):
        return [
            SearchPaper(
                source='arxiv',
                source_id='summary-1',
                title_en='Summary Paper',
                abstract_en='This paper studies a method.',
                authors='A, B',
                year=2025,
                venue='arXiv',
                pdf_url='https://arxiv.org/pdf/summary-1.pdf',
            )
        ]

    monkeypatch.setattr('app.api.routes.papers.arxiv_service.search', fake_arxiv)

    search_resp = client.post('/papers/search', json={'query': 'transformer', 'sources': ['arxiv'], 'limit': 1})
    assert search_resp.status_code == 200
    items = search_resp.json()['items']
    assert items

    paper_id = items[0]['id']
    response = client.post('/summaries/quick', json={'paper_id': paper_id})
    assert response.status_code == 200
    payload = response.json()
    assert payload['paper_id'] == paper_id
    assert payload['summary_type'] == 'quick'
