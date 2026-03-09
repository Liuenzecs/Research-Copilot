from datetime import date


def test_reflection_flow(client):
    create_resp = client.post(
        '/reflections',
        json={
            'reflection_type': 'paper',
            'template_type': 'paper',
            'stage': 'skimmed',
            'lifecycle_status': 'draft',
            'content_structured_json': {'paper_in_my_words': 'test'},
            'content_markdown': 'note',
            'is_report_worthy': True,
            'report_summary': 'one line',
            'event_date': date.today().isoformat(),
        },
    )
    assert create_resp.status_code == 200
    rid = create_resp.json()['id']

    update_resp = client.patch(f'/reflections/{rid}', json={'lifecycle_status': 'finalized'})
    assert update_resp.status_code == 200
    assert update_resp.json()['lifecycle_status'] == 'finalized'

    timeline = client.get('/reflections/timeline')
    assert timeline.status_code == 200
    assert len(timeline.json()) >= 1
