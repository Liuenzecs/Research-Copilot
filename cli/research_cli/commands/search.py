from research_cli.client import client


def run(query: str, limit: int = 10):
    payload = {'query': query, 'sources': ['arxiv', 'semantic_scholar'], 'limit': limit}
    return client.post('/papers/search', payload)
