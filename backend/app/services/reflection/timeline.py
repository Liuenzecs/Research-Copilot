from __future__ import annotations

import json


def build_timeline_item(reflection, task=None) -> dict:
    return {
        'id': reflection.id,
        'event_date': reflection.event_date,
        'reflection_type': reflection.reflection_type,
        'lifecycle_status': reflection.lifecycle_status,
        'is_report_worthy': reflection.is_report_worthy,
        'report_summary': reflection.report_summary,
        'content_structured_json': json.loads(reflection.content_structured_json or '{}'),
        'task': {
            'id': task.id,
            'task_type': task.task_type,
            'status': task.status,
        }
        if task
        else None,
    }
