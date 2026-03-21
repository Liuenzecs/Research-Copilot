from datetime import date

from app.services.paper_search.base import SearchPaper


def test_paper_workspace_flow(client, monkeypatch):
    async def fake_arxiv(query: str, limit: int = 10):
        return [
            SearchPaper(
                source='arxiv',
                source_id='ws-1',
                title_en='Workspace Paper',
                abstract_en='Workspace abstract',
                authors='A, B',
                year=2025,
                venue='arXiv',
                pdf_url='https://arxiv.org/pdf/ws-1.pdf',
            )
        ]

    monkeypatch.setattr('app.services.paper_search.service.paper_search_service.arxiv.search', fake_arxiv)

    search_resp = client.post('/papers/search', json={'query': 'workspace', 'sources': ['arxiv'], 'limit': 1})
    assert search_resp.status_code == 200
    paper_id = search_resp.json()['items'][0]['paper']['id']

    summary_resp = client.post('/summaries/quick', json={'paper_id': paper_id})
    assert summary_resp.status_code == 200
    summary_id = summary_resp.json()['id']

    ws = client.get(f'/papers/{paper_id}/workspace')
    assert ws.status_code == 200
    assert ws.json()['paper']['id'] == paper_id

    refl = client.post(
        f'/papers/{paper_id}/reflections',
        json={
            'summary_id': summary_id,
            'stage': 'skimmed',
            'lifecycle_status': 'draft',
            'content_structured_json': {'paper_in_my_words': 'test'},
            'content_markdown': 'note',
            'is_report_worthy': True,
            'report_summary': 'summary',
            'event_date': date.today().isoformat(),
        },
    )
    assert refl.status_code == 200
    assert refl.json()['related_summary_id'] == summary_id

    paper_only_refl = client.post(
        f'/papers/{paper_id}/reflections',
        json={
            'stage': 'skimmed',
            'lifecycle_status': 'draft',
            'content_structured_json': {'paper_in_my_words': 'paper-only test'},
            'content_markdown': 'paper only note',
            'is_report_worthy': False,
            'report_summary': 'paper-only summary',
            'event_date': date.today().isoformat(),
        },
    )
    assert paper_only_refl.status_code == 200
    assert paper_only_refl.json()['related_summary_id'] is None

    state = client.patch(
        f'/papers/{paper_id}/research-state',
        json={'reading_status': 'deep_read', 'interest_level': 5, 'is_core_paper': True},
    )
    assert state.status_code == 200
    assert state.json()['reading_status'] == 'deep_read'


def test_paper_opened_read_at_and_ai_reflection(client, monkeypatch):
    async def fake_arxiv(query: str, limit: int = 10):
        return [
            SearchPaper(
                source='arxiv',
                source_id='ws-ai-1',
                title_en='AI Reflection Paper',
                abstract_en='This paper studies LLM agents and evaluation.',
                authors='A, B',
                year=2025,
                venue='arXiv',
                pdf_url='https://arxiv.org/pdf/ws-ai-1.pdf',
            )
        ]

    monkeypatch.setattr('app.services.paper_search.service.paper_search_service.arxiv.search', fake_arxiv)

    search_resp = client.post('/papers/search', json={'query': 'agents', 'sources': ['arxiv'], 'limit': 1})
    assert search_resp.status_code == 200
    paper_id = search_resp.json()['items'][0]['paper']['id']

    opened_resp = client.post(f'/papers/{paper_id}/opened')
    assert opened_resp.status_code == 200
    assert opened_resp.json()['paper_id'] == paper_id
    assert opened_resp.json()['last_opened_at'] is not None

    state_resp = client.patch(
        f'/papers/{paper_id}/research-state',
        json={'read_at': '2026-03-01'},
    )
    assert state_resp.status_code == 200
    assert state_resp.json()['read_at'] == '2026-03-01'
    assert state_resp.json()['reading_status'] == 'skimmed'

    summary_resp = client.post('/summaries/quick', json={'paper_id': paper_id})
    assert summary_resp.status_code == 200
    summary_id = summary_resp.json()['id']

    ai_reflection = client.post(
        f'/papers/{paper_id}/reflections/ai-create',
        json={'mode': 'advisor', 'summary_id': summary_id},
    )
    assert ai_reflection.status_code == 200
    payload = ai_reflection.json()
    assert payload['related_summary_id'] == summary_id
    assert payload['lifecycle_status'] == 'draft'
    assert payload['is_report_worthy'] is True
    assert payload['content_structured_json']['ai_mode'] == 'advisor'
    assert payload['content_structured_json']['generated_from_read_at'] == '2026-03-01'
