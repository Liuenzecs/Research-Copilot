from research_cli.client import client


def plan(paper_id: int | None = None, repo_id: int | None = None):
    return client.post('/reproduction/plan', {'paper_id': paper_id, 'repo_id': repo_id})
