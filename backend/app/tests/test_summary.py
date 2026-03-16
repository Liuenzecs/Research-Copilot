import json

from app.services.paper_search.base import SearchPaper


class _FakeSummaryProvider:
    name = 'deepseek'
    model = 'deepseek-chat'

    async def complete(self, prompt: str, system_prompt: str = '') -> str:
        return '# Quick Summary\n\nThis is a completed summary.'

    async def stream_complete(self, prompt: str, system_prompt: str = ''):
        for chunk in ['# Quick Summary\n\n', 'This is ', 'a streamed summary.']:
            yield chunk


def _parse_stream_lines(response) -> list[dict]:
    items: list[dict] = []
    for line in response.iter_lines():
        if not line:
            continue
        items.append(json.loads(line))
    return items


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
    monkeypatch.setattr('app.services.summarize.service.summarize_service._provider', lambda: _FakeSummaryProvider())

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


def test_quick_summary_stream_returns_delta_and_complete(client, monkeypatch):
    async def fake_arxiv(query: str, limit: int = 10):
        return [
            SearchPaper(
                source='arxiv',
                source_id='summary-stream-1',
                title_en='Streaming Summary Paper',
                abstract_en='This paper studies streaming summaries.',
                authors='A, B',
                year=2025,
                venue='arXiv',
                pdf_url='https://arxiv.org/pdf/summary-stream-1.pdf',
            )
        ]

    monkeypatch.setattr('app.api.routes.papers.arxiv_service.search', fake_arxiv)
    monkeypatch.setattr('app.services.summarize.service.summarize_service._provider', lambda: _FakeSummaryProvider())

    search_resp = client.post('/papers/search', json={'query': 'stream summary', 'sources': ['arxiv'], 'limit': 1})
    paper_id = search_resp.json()['items'][0]['id']

    with client.stream('POST', '/summaries/quick/stream', json={'paper_id': paper_id}) as response:
        assert response.status_code == 200
        events = _parse_stream_lines(response)

    assert any(event['type'] == 'delta' for event in events)
    complete_event = next(event for event in events if event['type'] == 'complete')
    assert complete_event['summary']['paper_id'] == paper_id
    assert complete_event['summary']['summary_type'] == 'quick'
    assert complete_event['summary']['content_en'] == '# Quick Summary\n\nThis is a streamed summary.'


def test_deep_summary_stream_returns_complete(client, monkeypatch):
    async def fake_arxiv(query: str, limit: int = 10):
        return [
            SearchPaper(
                source='arxiv',
                source_id='summary-stream-2',
                title_en='Deep Streaming Summary Paper',
                abstract_en='This paper studies deep streaming summaries.',
                authors='A, B',
                year=2025,
                venue='arXiv',
                pdf_url='https://arxiv.org/pdf/summary-stream-2.pdf',
            )
        ]

    monkeypatch.setattr('app.api.routes.papers.arxiv_service.search', fake_arxiv)
    monkeypatch.setattr('app.services.summarize.service.summarize_service._provider', lambda: _FakeSummaryProvider())

    search_resp = client.post('/papers/search', json={'query': 'deep stream summary', 'sources': ['arxiv'], 'limit': 1})
    paper_id = search_resp.json()['items'][0]['id']

    with client.stream('POST', '/summaries/deep/stream', json={'paper_id': paper_id, 'focus': 'experiments'}) as response:
        assert response.status_code == 200
        events = _parse_stream_lines(response)

    complete_event = next(event for event in events if event['type'] == 'complete')
    assert complete_event['summary']['paper_id'] == paper_id
    assert complete_event['summary']['summary_type'] == 'deep'
