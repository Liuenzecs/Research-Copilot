from research_cli.client import client


def run(paper_id: int | None = None, arxiv_id: str | None = None):
    return client.post('/papers/download', {'paper_id': paper_id, 'arxiv_id': arxiv_id})
