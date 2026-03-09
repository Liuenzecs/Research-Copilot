from datetime import date, timedelta


def test_weekly_report_context_and_draft(client):
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)

    create_reflection = client.post(
        '/reflections',
        json={
            'reflection_type': 'paper',
            'template_type': 'paper',
            'stage': 'deep_read',
            'lifecycle_status': 'draft',
            'content_structured_json': {'what_i_learned': 'x'},
            'content_markdown': 'note',
            'is_report_worthy': True,
            'report_summary': 'important progress',
            'event_date': today.isoformat(),
        },
    )
    assert create_reflection.status_code == 200

    ctx = client.get(f'/reports/weekly/context?week_start={week_start}&week_end={week_end}')
    assert ctx.status_code == 200
    assert 'report_worthy_reflections' in ctx.json()

    draft = client.post(
        '/reports/weekly/drafts',
        json={'week_start': week_start.isoformat(), 'week_end': week_end.isoformat(), 'title': '本周汇报'},
    )
    assert draft.status_code == 200
    draft_id = draft.json()['id']

    patch = client.patch(f'/reports/weekly/drafts/{draft_id}', json={'status': 'finalized'})
    assert patch.status_code == 200
    assert patch.json()['status'] == 'finalized'

    history = client.get('/reports/weekly/drafts')
    assert history.status_code == 200
    assert any(item['id'] == draft_id for item in history.json())
