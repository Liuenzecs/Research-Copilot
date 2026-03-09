
def test_reproduction_step_tracking_and_reflection(client):
    plan_resp = client.post('/reproduction/plan', json={'paper_id': 1, 'repo_id': None})
    assert plan_resp.status_code == 200
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
