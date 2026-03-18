def test_provider_settings_returns_runtime_paths(client):
    response = client.get('/settings/providers')

    assert response.status_code == 200
    payload = response.json()
    assert payload['runtime_db_url']
    assert payload['runtime_data_dir']
    assert payload['runtime_vector_dir']
    assert any('临时数据库' in note for note in payload['notes'])
