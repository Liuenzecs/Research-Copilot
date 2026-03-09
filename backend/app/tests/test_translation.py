from app.services.paper_search.base import SearchPaper


def test_key_field_translation(client, monkeypatch):
    async def fake_arxiv(query: str, limit: int = 10):
        return [
            SearchPaper(
                source='arxiv',
                source_id='trans-1',
                title_en='Translation Paper',
                abstract_en='A translation test abstract.',
                authors='A',
                year=2025,
                venue='arXiv',
                pdf_url='https://arxiv.org/pdf/trans-1.pdf',
            )
        ]

    monkeypatch.setattr('app.api.routes.papers.arxiv_service.search', fake_arxiv)

    search_resp = client.post('/papers/search', json={'query': 'translation', 'sources': ['arxiv'], 'limit': 1})
    assert search_resp.status_code == 200
    paper_id = search_resp.json()['items'][0]['id']

    trans = client.post('/translation/key-fields', json={'target_type': 'paper', 'target_id': paper_id, 'fields': ['title']})
    assert trans.status_code == 200
    rows = trans.json()
    assert len(rows) >= 1
    assert rows[0]['disclaimer'] == 'AI翻译，仅供辅助理解'
