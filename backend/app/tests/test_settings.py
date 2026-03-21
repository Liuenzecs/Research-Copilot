from pathlib import Path


def test_provider_settings_returns_runtime_paths(client):
    response = client.get('/settings/providers')

    assert response.status_code == 200
    payload = response.json()
    assert payload['runtime_db_url']
    assert payload['runtime_data_dir']
    assert payload['runtime_vector_dir']
    assert payload['runtime_settings_path']
    assert any('临时数据库' in note for note in payload['notes'])


def test_provider_settings_can_be_updated_from_ui(client):
    response = client.patch(
        '/settings/providers',
        json={
            'primary_llm_provider': 'openai_compatible',
            'selection_llm_provider': 'openai_compatible',
            'openai_compatible_base_url': 'https://api.bltcy.ai/',
            'openai_compatible_model': 'claude',
            'openai_compatible_api_key': 'test-bltcy-key',
            'github_token': 'ghp_test',
            'semantic_scholar_api_key': 'ss_test',
            'libretranslate_api_url': '',
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload['primary_llm_provider'] == 'openai_compatible'
    assert payload['selection_llm_provider'] == 'openai_compatible'
    assert payload['openai_compatible_enabled'] is True
    assert payload['openai_compatible_model'] == 'claude'
    assert payload['openai_compatible_base_url'] == 'https://api.bltcy.ai'
    assert payload['openai_compatible_api_key_configured'] is True
    assert payload['github_token_configured'] is True
    assert payload['semantic_scholar_api_key_configured'] is True
    assert payload['libretranslate_enabled'] is False

    settings_path = Path(payload['runtime_settings_path'])
    assert settings_path.exists()

    follow_up = client.get('/settings/providers')
    assert follow_up.status_code == 200
    follow_up_payload = follow_up.json()
    assert follow_up_payload['openai_compatible_enabled'] is True
    assert follow_up_payload['openai_compatible_base_url'] == 'https://api.bltcy.ai'
