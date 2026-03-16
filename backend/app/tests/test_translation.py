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
    assert rows[0]['disclaimer'] == 'AI翻译，仅供辅助理解。英文原文始终保留。'


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
    assert payload['disclaimer'] == 'AI翻译，仅供辅助理解。英文原文始终保留。'


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
    assert payload['content_zh'].startswith('【中文辅助结果】')
    assert payload['disclaimer'] == '公共翻译接口暂不可用，当前结果为中文辅助占位，请优先参考英文原文。'


def test_segment_selection_translation_reuses_cached_result(client, monkeypatch):
    calls = {'count': 0}

    async def fake_public(text: str):
        calls['count'] += 1
        return '这是缓存后的翻译结果', 'libretranslate', 'public-free'

    monkeypatch.setattr('app.services.translation.service.translation_service._translate_via_libretranslate', fake_public)

    payload = {
        'text': 'Repeated translation text',
        'mode': 'selection',
        'locator': {'paper_id': 1, 'paragraph_id': 2, 'selected_text': 'Repeated translation text'},
    }
    first = client.post('/translation/segment', json=payload)
    second = client.post('/translation/segment', json=payload)
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()['content_zh'] == '这是缓存后的翻译结果'
    assert second.json()['content_zh'] == '这是缓存后的翻译结果'
    assert calls['count'] == 1


def test_segment_selection_translation_rejects_english_to_english_result(client, monkeypatch):
    async def fake_public(text: str):
        return text, 'libretranslate', 'public-free'

    monkeypatch.setattr('app.services.translation.service.translation_service._translate_via_libretranslate', fake_public)

    response = client.post(
        '/translation/segment',
        json={
            'text': 'This should not come back as English',
            'mode': 'selection',
            'locator': {'paper_id': 2, 'paragraph_id': 3, 'selected_text': 'This should not come back as English'},
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload['content_zh'] != 'This should not come back as English'
    assert '中文' in payload['content_zh']
