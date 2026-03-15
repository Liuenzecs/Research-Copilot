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

    monkeypatch.setattr('app.api.routes.papers.arxiv_service.search', fake_arxiv)
    response = client.post('/papers/search', json={'query': title, 'sources': ['arxiv'], 'limit': 1})
    assert response.status_code == 200
    return response.json()['items'][0]['id']


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
