from __future__ import annotations


def build_paper_index_item(paper, state=None) -> dict:
    return {
        'id': paper.id,
        'title_en': paper.title_en,
        'authors': paper.authors or '',
        'source': paper.source,
        'year': paper.year,
        'pdf_local_path': paper.pdf_local_path,
        'is_downloaded': bool((paper.pdf_local_path or '').strip()),
        'reading_status': getattr(state, 'reading_status', 'unread') if state else 'unread',
        'interest_level': getattr(state, 'interest_level', None) if state else None,
        'repro_interest': getattr(state, 'repro_interest', 'none') if state else 'none',
        'is_core_paper': getattr(state, 'is_core_paper', False) if state else False,
        'last_opened_at': getattr(state, 'last_opened_at', None) if state else None,
        'summary_count': 0,
        'reflection_count': 0,
        'reproduction_count': 0,
        'memory_count': 0,
        'in_memory': False,
        'last_activity_at': paper.created_at,
        'last_activity_label': '已加入文献库',
        'is_my_library': False,
    }
