def test_tasks_archive_flow(client):
    create_resp = client.post('/tasks', json={'task_type': 'demo_task', 'trigger_source': 'api', 'input_json': {'k': 1}})
    assert create_resp.status_code == 200
    tid = create_resp.json()['id']

    patch_resp = client.patch(f'/tasks/{tid}', json={'status': 'completed', 'archived': True})
    assert patch_resp.status_code == 200
    assert patch_resp.json()['status'] == 'archived'

    listed = client.get('/tasks')
    assert listed.status_code == 200
    assert all(item['id'] != tid for item in listed.json())

    listed_all = client.get('/tasks?include_archived=true')
    assert listed_all.status_code == 200
    assert any(item['id'] == tid for item in listed_all.json())
