def test_memory_query(client):
    payload = client.post('/memory/query', json={'query': 'anything', 'memory_types': [], 'layers': [], 'top_k': 5})
    assert payload.status_code == 200
    assert isinstance(payload.json(), list)
