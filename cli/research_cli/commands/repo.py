from research_cli.client import client


def find(query: str = '', paper_id: int | None = None):
    return client.post('/repos/find', {'query': query or None, 'paper_id': paper_id})
