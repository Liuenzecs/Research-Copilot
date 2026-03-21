import json
import time
from datetime import date

from app.db.session import SessionLocal
from app.models.db.reproduction_record import ReproductionRecord
from app.models.db.task_record import TaskRecord
from app.services.paper_search.base import SearchPaper
from app.services.project.service import project_service
from app.services.workflow.service import workflow_service


def _search_payload(monkeypatch, items: list[SearchPaper]) -> list[int]:
    async def fake_arxiv(query: str, limit: int = 10):
        return items

    monkeypatch.setattr('app.services.paper_search.service.paper_search_service.arxiv.search', fake_arxiv)


def _wait_for_task(client, project_id: int, task_id: int, timeout: float = 5.0) -> dict:
    deadline = time.time() + timeout
    last_payload = {}
    while time.time() < deadline:
        response = client.get(f'/projects/{project_id}/tasks/{task_id}')
        assert response.status_code == 200
        last_payload = response.json()
        if last_payload['status'] != 'running':
            return last_payload
        time.sleep(0.05)
    raise AssertionError(f'Task {task_id} did not finish in time: {last_payload}')


def test_project_crud_reorder_and_manual_evidence(client, monkeypatch):
    _search_payload(
        monkeypatch,
        [
            SearchPaper(
                source='arxiv',
                source_id='project-1',
                title_en='Project Paper One',
                abstract_en='Project paper one abstract about transformers.',
                authors='A',
                year=2025,
                venue='arXiv',
                pdf_url='https://arxiv.org/pdf/project-1.pdf',
            )
        ],
    )

    paper_resp = client.post('/papers/search', json={'query': 'transformer', 'sources': ['arxiv'], 'limit': 1})
    assert paper_resp.status_code == 200
    paper_id = paper_resp.json()['items'][0]['paper']['id']

    create_resp = client.post('/projects', json={'research_question': 'How should I compare transformer papers?', 'goal': 'Write a short review'})
    assert create_resp.status_code == 200
    project_id = create_resp.json()['id']

    list_resp = client.get('/projects')
    assert list_resp.status_code == 200
    assert list_resp.json()[0]['id'] == project_id
    assert list_resp.json()[0]['paper_count'] == 0
    assert list_resp.json()[0]['evidence_count'] == 0
    assert list_resp.json()[0]['output_count'] == 0

    update_resp = client.patch(f'/projects/{project_id}', json={'status': 'paused', 'title': 'Transformer Comparison'})
    assert update_resp.status_code == 200
    assert update_resp.json()['status'] == 'paused'

    add_resp = client.post(f'/projects/{project_id}/papers', json={'paper_id': paper_id, 'selection_reason': 'Seed paper'})
    assert add_resp.status_code == 200
    project_paper_id = add_resp.json()['id']

    batch_state_resp = client.patch(
        f'/projects/{project_id}/papers/batch-state',
        json={'paper_ids': [paper_id], 'read_at': '2026-03-01'},
    )
    assert batch_state_resp.status_code == 200

    ws_after_read = client.get(f'/projects/{project_id}/workspace')
    assert ws_after_read.status_code == 200
    assert ws_after_read.json()['papers'][0]['read_at'] == '2026-03-01'
    assert ws_after_read.json()['papers'][0]['paper']['id'] == paper_id

    first_evidence = client.post(
        f'/projects/{project_id}/evidence',
        json={
            'paper_id': paper_id,
            'kind': 'claim',
            'excerpt': 'Transformers replace recurrence with attention.',
            'note_text': 'Important baseline claim',
            'source_label': 'Manual note',
        },
    )
    assert first_evidence.status_code == 200
    second_evidence = client.post(
        f'/projects/{project_id}/evidence',
        json={
            'paper_id': paper_id,
            'kind': 'method',
            'excerpt': 'The model uses multi-head self-attention.',
            'note_text': '',
            'source_label': 'Manual note',
        },
    )
    assert second_evidence.status_code == 200
    first_id = first_evidence.json()['id']
    second_id = second_evidence.json()['id']

    reorder_resp = client.patch(
        f'/projects/{project_id}/evidence/reorder',
        json={'evidence_ids': [second_id, first_id]},
    )
    assert reorder_resp.status_code == 200
    assert [item['id'] for item in reorder_resp.json()['items']] == [second_id, first_id]

    patch_evidence = client.patch(
        f'/projects/{project_id}/evidence/{first_id}',
        json={'note_text': 'Edited note'},
    )
    assert patch_evidence.status_code == 200
    assert patch_evidence.json()['note_text'] == 'Edited note'

    ws_resp = client.get(f'/projects/{project_id}/workspace')
    assert ws_resp.status_code == 200
    assert [item['id'] for item in ws_resp.json()['evidence_items']] == [second_id, first_id]

    list_after_evidence = client.get('/projects')
    assert list_after_evidence.status_code == 200
    assert list_after_evidence.json()[0]['paper_count'] == 1
    assert list_after_evidence.json()[0]['evidence_count'] == 2
    assert list_after_evidence.json()[0]['output_count'] == 0

    delete_evidence = client.delete(f'/projects/{project_id}/evidence/{first_id}')
    assert delete_evidence.status_code == 204

    delete_link = client.delete(f'/projects/{project_id}/papers/{project_paper_id}')
    assert delete_link.status_code == 204

    ws_after = client.get(f'/projects/{project_id}/workspace')
    assert ws_after.status_code == 200
    assert ws_after.json()['papers'] == []

    delete_project = client.delete(f'/projects/{project_id}')
    assert delete_project.status_code == 204

    missing_project = client.get(f'/projects/{project_id}')
    assert missing_project.status_code == 404


def test_project_actions_launch_background_task_and_stream(client, monkeypatch):
    _search_payload(
        monkeypatch,
        [
            SearchPaper(
                source='arxiv',
                source_id='project-a',
                title_en='Paper A',
                abstract_en='Paper A studies sequence modeling and benchmarks attention methods.',
                authors='A',
                year=2025,
                venue='arXiv',
                pdf_url='https://arxiv.org/pdf/project-a.pdf',
            ),
            SearchPaper(
                source='arxiv',
                source_id='project-b',
                title_en='Paper B',
                abstract_en='Paper B studies efficient transformers on long-context tasks.',
                authors='B',
                year=2024,
                venue='arXiv',
                pdf_url='https://arxiv.org/pdf/project-b.pdf',
            ),
        ],
    )

    async def fake_quick(title: str, abstract: str, body: str):
        base = title.replace('Paper ', 'Question ')
        return (
            {
                'content_en': f'{title} summary. Dataset benchmark accuracy result.',
                'problem_en': f'{base} problem',
                'method_en': f'{title} method',
                'contributions_en': f'{title} main contribution',
                'limitations_en': f'{title} limitation',
                'future_work_en': f'{title} future work',
            },
            'heuristic',
            'local',
        )

    monkeypatch.setattr('app.services.project.service.summarize_service.quick', fake_quick)

    paper_resp = client.post('/papers/search', json={'query': 'attention', 'sources': ['arxiv'], 'limit': 2})
    assert paper_resp.status_code == 200
    paper_ids = [item['paper']['id'] for item in paper_resp.json()['items']]

    project_resp = client.post('/projects', json={'research_question': 'How do these attention papers compare?', 'goal': 'Produce a comparison table'})
    assert project_resp.status_code == 200
    project_id = project_resp.json()['id']

    for paper_id in paper_ids:
        add_resp = client.post(f'/projects/{project_id}/papers', json={'paper_id': paper_id})
        assert add_resp.status_code == 200

    launch_resp = client.post(
        f'/projects/{project_id}/actions/extract-evidence',
        json={'paper_ids': paper_ids, 'instruction': 'Focus on benchmarking setup'},
    )
    assert launch_resp.status_code == 202
    launch_payload = launch_resp.json()
    task_id = launch_payload['task']['id']
    assert launch_payload['stream_url'].endswith(f'/projects/{project_id}/tasks/{task_id}/stream')

    with client.stream('GET', launch_payload['stream_url']) as response:
        assert response.status_code == 200
        event_types = []
        refreshed_workspace = None
        for line in response.iter_lines():
            if not line:
                continue
            event = json.loads(line)
            event_types.append(event['type'])
            if event['type'] == 'workspace_refreshed':
                refreshed_workspace = event['workspace']
                break

    assert 'task_started' in event_types
    assert 'progress' in event_types
    assert 'task_completed' in event_types
    assert refreshed_workspace is not None
    assert len(refreshed_workspace['evidence_items']) >= 4

    compare_launch = client.post(
        f'/projects/{project_id}/actions/generate-compare-table',
        json={'paper_ids': paper_ids, 'instruction': 'Highlight reproducibility'},
    )
    assert compare_launch.status_code == 202
    compare_task = _wait_for_task(client, project_id, compare_launch.json()['task']['id'])
    assert compare_task['status'] == 'completed'

    review_launch = client.post(
        f'/projects/{project_id}/actions/draft-literature-review',
        json={'paper_ids': paper_ids, 'instruction': 'Mention open questions'},
    )
    assert review_launch.status_code == 202
    review_task = _wait_for_task(client, project_id, review_launch.json()['task']['id'])
    assert review_task['status'] == 'completed'

    workspace = client.get(f'/projects/{project_id}/workspace').json()
    compare_output = next(item for item in workspace['outputs'] if item['output_type'] == 'compare_table')
    review_output = next(item for item in workspace['outputs'] if item['output_type'] == 'literature_review')
    assert compare_output['content_json']['columns'][0] == 'Paper'
    assert len(compare_output['content_json']['rows']) == 2
    assert '## Problem Framing' in review_output['content_markdown']
    assert workspace['linked_existing_artifacts'][0]['summaries']


def test_project_filters_and_restart_cleanup(client, monkeypatch):
    _search_payload(
        monkeypatch,
        [
            SearchPaper(
                source='arxiv',
                source_id='project-main',
                title_en='Project Paper',
                abstract_en='Project paper abstract.',
                authors='A',
                year=2025,
                venue='arXiv',
                pdf_url='https://arxiv.org/pdf/project-main.pdf',
            ),
            SearchPaper(
                source='arxiv',
                source_id='project-other',
                title_en='Other Paper',
                abstract_en='Other paper abstract.',
                authors='B',
                year=2024,
                venue='arXiv',
                pdf_url='https://arxiv.org/pdf/project-other.pdf',
            ),
        ],
    )

    paper_resp = client.post('/papers/search', json={'query': 'paper', 'sources': ['arxiv'], 'limit': 2})
    paper_ids = [item['paper']['id'] for item in paper_resp.json()['items']]
    project_paper_id, other_paper_id = paper_ids

    project_resp = client.post('/projects', json={'research_question': 'Project scoped filtering'})
    project_id = project_resp.json()['id']
    client.post(f'/projects/{project_id}/papers', json={'paper_id': project_paper_id})

    with SessionLocal() as db:
        project_repro = ReproductionRecord(
            paper_id=project_paper_id,
            repo_id=None,
            plan_markdown='plan',
            progress_summary='in progress',
            progress_percent=20,
            status='planned',
        )
        other_repro = ReproductionRecord(
            paper_id=other_paper_id,
            repo_id=None,
            plan_markdown='plan',
            progress_summary='other',
            progress_percent=10,
            status='planned',
        )
        db.add(project_repro)
        db.add(other_repro)
        db.commit()
        db.refresh(project_repro)
        db.refresh(other_repro)

        project_task = workflow_service.create_task(
            db,
            task_type='project_extract_evidence',
            input_json={'project_id': project_id},
            status='running',
        )
        project_task_id = project_task.id
        workflow_service.add_artifact(
            db,
            project_task.id,
            artifact_type='project_action',
            artifact_ref_type='projects',
            artifact_ref_id=project_id,
            snapshot_json={'action': 'extract_evidence'},
        )

    reflection_resp = client.post(
        '/reflections',
        json={
            'reflection_type': 'paper',
            'related_paper_id': project_paper_id,
            'template_type': 'paper',
            'stage': 'reading',
            'lifecycle_status': 'draft',
            'content_structured_json': {'note': 'project reflection'},
            'content_markdown': 'project reflection',
            'report_summary': 'project summary',
            'event_date': str(date.today()),
        },
    )
    assert reflection_resp.status_code == 200

    other_reflection = client.post(
        '/reflections',
        json={
            'reflection_type': 'paper',
            'related_paper_id': other_paper_id,
            'template_type': 'paper',
            'stage': 'reading',
            'lifecycle_status': 'draft',
            'content_structured_json': {'note': 'other reflection'},
            'content_markdown': 'other reflection',
            'report_summary': 'other summary',
            'event_date': str(date.today()),
        },
    )
    assert other_reflection.status_code == 200

    reflections = client.get(f'/reflections?project_id={project_id}').json()
    assert len(reflections) == 1
    assert reflections[0]['related_paper_id'] == project_paper_id

    reproductions = client.get(f'/reproduction?project_id={project_id}').json()
    assert len(reproductions) == 1
    assert reproductions[0]['paper_id'] == project_paper_id

    memories = client.get(f'/memory?project_id={project_id}').json()
    assert memories
    assert all(item['jump_target']['path'].endswith(f'project_id={project_id}') for item in memories if item.get('jump_target'))

    delete_while_running = client.delete(f'/projects/{project_id}')
    assert delete_while_running.status_code == 409

    with SessionLocal() as db:
        marked = project_service.mark_interrupted_project_tasks_failed(db)
        repaired_task = db.get(TaskRecord, project_task_id)

    assert marked == 1
    assert repaired_task is not None
    assert repaired_task.status == 'failed'
    assert repaired_task.error_log == 'interrupted_by_backend_restart'


def test_project_list_sorting_and_counts_follow_last_opened(client):
    first_resp = client.post('/projects', json={'research_question': 'First project question'})
    assert first_resp.status_code == 200
    first_id = first_resp.json()['id']

    time.sleep(0.02)

    second_resp = client.post('/projects', json={'research_question': 'Second project question'})
    assert second_resp.status_code == 200
    second_id = second_resp.json()['id']

    listed = client.get('/projects')
    assert listed.status_code == 200
    listed_ids = [item['id'] for item in listed.json()]
    assert listed_ids[:2] == [second_id, first_id]
    assert all(item['paper_count'] == 0 for item in listed.json()[:2])

    touched = client.get(f'/projects/{first_id}')
    assert touched.status_code == 200

    listed_after_touch = client.get('/projects')
    assert listed_after_touch.status_code == 200
    assert listed_after_touch.json()[0]['id'] == first_id


def test_ai_curated_saved_search_and_batch_add(client, monkeypatch):
    _search_payload(
        monkeypatch,
        [
            SearchPaper(
                source='arxiv',
                source_id=f'ai-curated-{index}',
                title_en=f'LLM Agent Paper {index}',
                abstract_en=f'This paper studies LLM agents, planning, tools, and reproducibility benchmark {index}.',
                authors='A',
                year=2026 - (index % 4),
                venue='arXiv',
                pdf_url=f'https://arxiv.org/pdf/ai-curated-{index}.pdf',
            )
            for index in range(1, 28)
        ],
    )

    project_resp = client.post('/projects', json={'research_question': 'How should I study LLM agents efficiently?'})
    assert project_resp.status_code == 200
    project_id = project_resp.json()['id']

    launch_resp = client.post(
        f'/projects/{project_id}/actions/curate-reading-list',
        json={
            'user_need': 'Select the best papers for learning LLM agents and reproduction',
            'target_count': 20,
            'selection_profile': 'balanced',
            'sources': ['arxiv'],
        },
    )
    assert launch_resp.status_code == 202
    task_id = launch_resp.json()['task']['id']

    task_payload = _wait_for_task(client, project_id, task_id, timeout=10.0)
    assert task_payload['status'] == 'completed'
    saved_search_id = task_payload['output_json']['saved_search_id']
    assert saved_search_id

    saved_search_detail = client.get(f'/projects/{project_id}/saved-searches/{saved_search_id}')
    assert saved_search_detail.status_code == 200
    detail_payload = saved_search_detail.json()
    assert detail_payload['saved_search']['search_mode'] == 'ai_curated'
    assert detail_payload['saved_search']['target_count'] == 20
    assert len(detail_payload['items']) == 20
    assert all(item['selected_by_ai'] for item in detail_payload['items'])

    batch_add_resp = client.post(
        f'/projects/{project_id}/papers/batch-add',
        json={
            'items': [
                {
                    'paper_id': item['paper']['id'],
                    'saved_search_candidate_id': item['candidate_id'],
                }
                for item in detail_payload['items'][:3]
            ]
        },
    )
    assert batch_add_resp.status_code == 200
    batch_items = batch_add_resp.json()['items']
    assert len(batch_items) == 3
    assert all(item['selection_reason'] for item in batch_items)
