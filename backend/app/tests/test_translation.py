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


def test_segment_selection_translation_prefers_public_api(client, monkeypatch):
    async def fake_public(text: str):
        return '选词翻译结果', 'libretranslate', 'public-free'

    monkeypatch.setattr('app.services.translation.service.translation_service._translate_via_libretranslate', fake_public)

    response = client.post(
        '/translation/segment',
        json={
            'text': 'Selected text for translation',
            'mode': 'selection',
            'locator': {'paper_id': 1, 'paragraph_id': 2, 'selected_text': 'Selected text for translation'},
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload['content_zh'] == '选词翻译结果'
    assert payload['disclaimer'] == 'AI翻译，仅供辅助理解'


def test_segment_selection_translation_falls_back_to_local_helper(client, monkeypatch):
    async def broken_public(text: str):
        raise RuntimeError('service unavailable')

    monkeypatch.setattr('app.services.translation.service.translation_service._translate_via_libretranslate', broken_public)

    response = client.post(
        '/translation/segment',
        json={
            'text': 'Fallback translation text',
            'mode': 'selection',
            'locator': {'paper_id': 1, 'paragraph_id': 1, 'selected_text': 'Fallback translation text'},
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload['content_zh'].startswith('【中文辅助】')
