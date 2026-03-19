import time

from app.services.paper_search.base import SearchPaper


def _create_paper(client, monkeypatch, source_id: str = 'repro-1', title: str = 'Repro Paper') -> int:
    async def fake_arxiv(query: str, limit: int = 10):
        return [
            SearchPaper(
                source='arxiv',
                source_id=source_id,
                title_en=title,
                abstract_en='A reproducible paper',
                authors='A',
                year=2025,
                venue='arXiv',
                pdf_url=f'https://arxiv.org/pdf/{source_id}.pdf',
            )
        ]

    monkeypatch.setattr('app.services.paper_search.service.paper_search_service.arxiv.search', fake_arxiv)
    response = client.post('/papers/search', json={'query': title, 'sources': ['arxiv'], 'limit': 1})
    assert response.status_code == 200
    return response.json()['items'][0]['paper']['id']


def _mock_reproduction_planner(monkeypatch) -> None:
    async def fake_plan(context: str):
        return (
            f'# Reproduction Plan\n\nContext: {context}\n',
            [
                {
                    'step_no': 1,
                    'command': 'git clone <repo_url>',
                    'purpose': 'Fetch source code',
                    'risk_level': 'low',
                    'requires_manual_confirm': True,
                    'expected_output': 'Repository cloned locally',
                }
            ],
        )

    monkeypatch.setattr('app.api.routes.reproduction.reproduction_planner.plan', fake_plan)


def test_reproduction_step_tracking_and_reflection(client, monkeypatch):
    _mock_reproduction_planner(monkeypatch)
    paper_id = _create_paper(client, monkeypatch)

    plan_resp = client.post('/reproduction/plan', json={'paper_id': paper_id, 'repo_id': None})
    assert plan_resp.status_code == 200
    assert plan_resp.json()['reproduction_id'] > 0
    reproduction_id = plan_resp.json()['reproduction_id']
    first_step_id = plan_resp.json()['steps'][0]['id']

    step_patch = client.patch(
        f'/reproduction/{reproduction_id}/steps/{first_step_id}',
        json={'step_status': 'blocked', 'progress_note': 'failed', 'blocker_reason': 'dependency mismatch'},
    )
    assert step_patch.status_code == 200
    assert step_patch.json()['step_status'] == 'blocked'

    repro_patch = client.patch(
        f'/reproduction/{reproduction_id}',
        json={'progress_summary': 'blocked on dependency', 'progress_percent': 30},
    )
    assert repro_patch.status_code == 200
    assert repro_patch.json()['progress_percent'] == 30

    detail = client.get(f'/reproduction/{reproduction_id}')
    assert detail.status_code == 200
    assert detail.json()['paper_id'] == paper_id
    assert len(detail.json()['steps']) >= 1

    reflection = client.post(
        f'/reproduction/{reproduction_id}/reflections',
        json={
            'stage': 'progress',
            'lifecycle_status': 'draft',
            'is_report_worthy': True,
            'report_summary': 'blocked and planned next step',
            'content_structured_json': {'what_i_did_today': 'ran baseline'},
        },
    )
    assert reflection.status_code == 200
    assert reflection.json()['related_reproduction_id'] == reproduction_id


def test_reproduction_step_note_log_creates_analysis_without_blocking(client, monkeypatch):
    _mock_reproduction_planner(monkeypatch)
    paper_id = _create_paper(client, monkeypatch, source_id='repro-log-note-1', title='Repro Log Note Paper')

    plan_resp = client.post('/reproduction/plan', json={'paper_id': paper_id})
    assert plan_resp.status_code == 200
    reproduction_id = plan_resp.json()['reproduction_id']
    step_id = plan_resp.json()['steps'][0]['id']

    log_resp = client.post(
        f'/reproduction/{reproduction_id}/steps/{step_id}/logs',
        json={'log_text': "ModuleNotFoundError: No module named 'torch'", 'log_kind': 'note'},
    )
    assert log_resp.status_code == 200
    assert log_resp.json()['step_id'] == step_id
    assert log_resp.json()['error_type'] == 'missing_dependency'
    assert 'install the missing dependency' in log_resp.json()['next_step_suggestion']

    detail = client.get(f'/reproduction/{reproduction_id}')
    assert detail.status_code == 200
    assert detail.json()['steps'][0]['step_status'] == 'pending'
    assert len(detail.json()['logs']) == 1
    assert detail.json()['logs'][0]['step_id'] == step_id


def test_reproduction_step_blocker_log_blocks_step_and_updates_detail(client, monkeypatch):
    _mock_reproduction_planner(monkeypatch)
    paper_id = _create_paper(client, monkeypatch, source_id='repro-log-blocker-1', title='Repro Log Blocker Paper')

    plan_resp = client.post('/reproduction/plan', json={'paper_id': paper_id})
    assert plan_resp.status_code == 200
    reproduction_id = plan_resp.json()['reproduction_id']
    step_id = plan_resp.json()['steps'][0]['id']

    before = client.get(f'/reproduction/{reproduction_id}')
    assert before.status_code == 200
    before_updated_at = before.json()['updated_at']

    time.sleep(1.1)
    log_resp = client.post(
        f'/reproduction/{reproduction_id}/steps/{step_id}/logs',
        json={'log_text': 'CUDA out of memory while running baseline', 'log_kind': 'blocker'},
    )
    assert log_resp.status_code == 200
    assert log_resp.json()['error_type'] == 'oom'
    assert 'reducing batch size' in log_resp.json()['next_step_suggestion']

    detail = client.get(f'/reproduction/{reproduction_id}')
    assert detail.status_code == 200
    step = detail.json()['steps'][0]
    assert step['step_status'] == 'blocked'
    assert step['blocked_at'] is not None
    assert step['blocker_reason'] == 'CUDA out of memory while running baseline'
    assert detail.json()['updated_at'] != before_updated_at
    assert len(detail.json()['logs']) == 1


def test_list_reproductions_returns_latest_updated_for_paper(client, monkeypatch):
    _mock_reproduction_planner(monkeypatch)
    paper_id = _create_paper(client, monkeypatch, source_id='repro-list-1', title='Repro List Paper')

    first_plan = client.post('/reproduction/plan', json={'paper_id': paper_id})
    second_plan = client.post('/reproduction/plan', json={'paper_id': paper_id})
    assert first_plan.status_code == 200
    assert second_plan.status_code == 200

    first_id = first_plan.json()['reproduction_id']
    time.sleep(1.1)
    refresh = client.patch(f'/reproduction/{first_id}', json={'progress_summary': 'refreshed latest'})
    assert refresh.status_code == 200

    response = client.get(f'/reproduction?paper_id={paper_id}&limit=1')
    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1
    assert payload[0]['reproduction_id'] == first_id
    assert payload[0]['paper_id'] == paper_id
    assert payload[0]['progress_summary'] == 'refreshed latest'
