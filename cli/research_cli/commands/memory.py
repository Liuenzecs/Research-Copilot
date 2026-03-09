from research_cli.client import client


def query(text: str, top_k: int = 10):
    return client.post('/memory/query', {'query': text, 'memory_types': [], 'layers': [], 'top_k': top_k})
