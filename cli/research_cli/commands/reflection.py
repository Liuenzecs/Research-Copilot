from datetime import date

from research_cli.client import client


def create(reflection_type: str = 'paper', stage: str = 'initial', summary: str = ''):
    payload = {
        'reflection_type': reflection_type,
        'template_type': reflection_type,
        'stage': stage,
        'lifecycle_status': 'draft',
        'content_structured_json': {},
        'content_markdown': '',
        'is_report_worthy': bool(summary),
        'report_summary': summary,
        'event_date': date.today().isoformat(),
    }
    return client.post('/reflections', payload)


def list_items(status: str = ''):
    if status:
        return client.get(f'/reflections?lifecycle_status={status}')
    return client.get('/reflections')


def show(reflection_id: int):
    return client.get(f'/reflections/{reflection_id}')
