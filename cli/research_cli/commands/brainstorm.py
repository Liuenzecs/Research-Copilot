from research_cli.client import client


def ideas(topic: str):
    return client.post('/brainstorm/ideas', {'topic': topic, 'paper_ids': []})
