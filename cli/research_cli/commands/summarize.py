from research_cli.client import client


def quick(paper_id: int):
    return client.post('/summaries/quick', {'paper_id': paper_id})


def deep(paper_id: int, focus: str = ''):
    return client.post('/summaries/deep', {'paper_id': paper_id, 'focus': focus or None})
