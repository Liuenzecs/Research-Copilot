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


def test_list_reflections_supports_is_report_worthy_filter(client):
    today = date.today().isoformat()

    report_worthy_resp = client.post(
        '/reflections',
        json={
            'reflection_type': 'paper',
            'template_type': 'paper',
            'stage': 'skimmed',
            'lifecycle_status': 'draft',
            'content_structured_json': {'paper_in_my_words': 'report worthy'},
            'content_markdown': 'worth sharing',
            'is_report_worthy': True,
            'report_summary': 'share this',
            'event_date': today,
        },
    )
    assert report_worthy_resp.status_code == 200

    non_report_resp = client.post(
        '/reflections',
        json={
            'reflection_type': 'reproduction',
            'template_type': 'reproduction',
            'stage': 'in_progress',
            'lifecycle_status': 'draft',
            'content_structured_json': {'progress': 'private note'},
            'content_markdown': 'keep working',
            'is_report_worthy': False,
            'report_summary': '',
            'event_date': today,
        },
    )
    assert non_report_resp.status_code == 200

    response = client.get(f'/reflections?is_report_worthy=true&lifecycle_status=draft&date_from={today}&date_to={today}')
    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1
    assert payload[0]['is_report_worthy'] is True
    assert payload[0]['reflection_type'] == 'paper'
