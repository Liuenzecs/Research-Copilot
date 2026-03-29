import json

from app.db.session import SessionLocal
from app.models.db.paper_record import PaperRecord
from app.services.paper_search.base import SearchPaper


class _FakeSelectionProvider:
    name = 'deepseek'
    model = 'deepseek-chat'

    def __init__(self, *, complete_text: str = '中文翻译结果', stream_chunks: list[str] | None = None) -> None:
        self.complete_text = complete_text
        self.stream_chunks = stream_chunks or ['中文', '翻译', '结果']

    async def complete(self, prompt: str, system_prompt: str = '') -> str:
        return self.complete_text

    async def stream_complete(self, prompt: str, system_prompt: str = ''):
        for chunk in self.stream_chunks:
            yield chunk


def _parse_stream_lines(response) -> list[dict]:
    items: list[dict] = []
    for line in response.iter_lines():
        if not line:
            continue
        items.append(json.loads(line))
    return items


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

    monkeypatch.setattr('app.services.paper_search.service.paper_search_service.arxiv.search', fake_arxiv)
    monkeypatch.setattr(
        'app.services.translation.service.translation_service._provider',
        lambda: _FakeSelectionProvider(complete_text='论文标题中文翻译'),
    )

    search_resp = client.post('/papers/search', json={'query': 'translation', 'sources': ['arxiv'], 'limit': 1})
    assert search_resp.status_code == 200
    paper_id = search_resp.json()['items'][0]['paper']['id']

    trans = client.post('/translation/key-fields', json={'target_type': 'paper', 'target_id': paper_id, 'fields': ['title']})
    assert trans.status_code == 200
    rows = trans.json()
    assert len(rows) >= 1
    assert rows[0]['disclaimer'] == 'AI翻译，仅供辅助理解。英文原文始终保留。'


def test_segment_selection_translation_prefers_deepseek(client, monkeypatch):
    monkeypatch.setattr(
        'app.services.translation.service.translation_service.selection_provider',
        lambda: _FakeSelectionProvider(complete_text='选词翻译结果'),
    )

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
    monkeypatch.setattr('app.services.translation.service.translation_service.selection_provider', lambda: None)

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
    assert payload['disclaimer'] == '模型翻译暂不可用，当前结果为中文辅助占位，请优先参考英文原文。'


def test_segment_selection_translation_reuses_cached_result(client, monkeypatch):
    calls = {'count': 0}

    class _CountingProvider(_FakeSelectionProvider):
        async def complete(self, prompt: str, system_prompt: str = '') -> str:
            calls['count'] += 1
            return '这是缓存后的翻译结果'

    monkeypatch.setattr('app.services.translation.service.translation_service.selection_provider', lambda: _CountingProvider())

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
    monkeypatch.setattr(
        'app.services.translation.service.translation_service.selection_provider',
        lambda: _FakeSelectionProvider(complete_text='This should not come back as English'),
    )

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


def test_segment_selection_stream_returns_delta_and_complete(client, monkeypatch):
    monkeypatch.setattr(
        'app.services.translation.service.translation_service.selection_provider',
        lambda: _FakeSelectionProvider(stream_chunks=['中文', '翻译', '完成']),
    )

    with client.stream(
        'POST',
        '/translation/segment/stream',
        json={
            'text': 'dominant',
            'mode': 'selection',
            'locator': {'paper_id': 1, 'paragraph_id': 5, 'selected_text': 'dominant'},
        },
    ) as response:
        assert response.status_code == 200
        events = _parse_stream_lines(response)

    assert any(event['type'] == 'delta' for event in events)
    complete_event = next(event for event in events if event['type'] == 'complete')
    assert complete_event['translation']['content_zh'] == '中文翻译完成'


def test_segment_selection_stream_reuses_cached_result(client, monkeypatch):
    monkeypatch.setattr(
        'app.services.translation.service.translation_service.selection_provider',
        lambda: _FakeSelectionProvider(complete_text='缓存流式翻译'),
    )

    payload = {
        'text': 'cached stream selection',
        'mode': 'selection',
        'locator': {'paper_id': 1, 'paragraph_id': 4, 'selected_text': 'cached stream selection'},
    }
    first = client.post('/translation/segment', json=payload)
    assert first.status_code == 200

    with client.stream('POST', '/translation/segment/stream', json=payload) as response:
        assert response.status_code == 200
        events = _parse_stream_lines(response)

    assert events == [events[-1]]
    assert events[-1]['type'] == 'complete'
    assert events[-1]['translation']['content_zh'] == '缓存流式翻译'


def test_paper_title_backfill_updates_title_zh_and_returns_updated_item(client, monkeypatch):
    with SessionLocal() as db:
        paper = PaperRecord(
            source='arxiv',
            source_id='title-backfill-paper',
            title_en='Large Language Models are Zero-Shot Reasoners',
            title_zh='',
            abstract_en='Test abstract',
            authors='Author A',
            year=2022,
            venue='NeurIPS',
        )
        db.add(paper)
        db.commit()
        db.refresh(paper)
        paper_id = paper.id

    monkeypatch.setattr(
        'app.services.translation.service.translation_service._provider',
        lambda: _FakeSelectionProvider(complete_text='大语言模型是零样本推理器'),
    )

    response = client.post('/papers/title-translations/backfill', json={'paper_ids': [paper_id]})
    assert response.status_code == 200
    payload = response.json()
    assert payload['updated_paper_ids'] == [paper_id]
    assert payload['skipped_paper_ids'] == []
    assert payload['items'][0]['title_zh'] == '大语言模型是零样本推理器'

    with SessionLocal() as db:
        paper = db.get(PaperRecord, paper_id)
        assert paper is not None
        assert paper.title_zh == '大语言模型是零样本推理器'
